// Lifecycle of one scrcpy 5.0.1 session over a forward tunnel (ADR-5).
import type { ChildProcess } from 'node:child_process'
import { randomInt } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { connect, createServer, type Socket } from 'node:net'
import { DEVICE_NAME_FIELD_LENGTH, DEVICE_SERVER_PATH, SCRCPY_VERSION } from '@shared/scrcpy/constants'
import { DeviceMessageParser, type DeviceMessage } from '@shared/scrcpy/device-messages'
import { parseDeviceName, StreamDemuxer, type StreamEvent } from '@shared/scrcpy/stream'
import type { Adb } from '../adb/adb'
import { SocketReader } from './socket-reader'
import { ControlQueue } from '@shared/scrcpy/control-queue'

/** Control bytes in flight before input starts queueing (~4 KB ≈ 125 touch moves). */
const CONTROL_HIGH_WATER = 4096

export interface SessionOptions {
  serial: string
  /** Local path of the scrcpy-server binary (resources/scrcpy-server-v5.0.1). */
  serverPath: string
  maxSize?: number
  videoBitRate?: number
  maxFps?: number
  control?: boolean
  stayAwake?: boolean
  /** false: don't push phone clipboard changes to the Mac (scrcpy default is true). */
  clipboardAutosync?: boolean
  /**
   * off: no audio. mac: audio_source=output (mutes the phone while mirroring, scrcpy default).
   * both: audio_source=playback + audio_dup (Android 13+, keeps the phone playing; apps may opt out).
   */
  audio?: AudioMode
  /** scrcpy show_touches: the phone draws touch dots (setting restored by the server's cleanup). */
  showTouches?: boolean
  /** h265 = sharper at the same bitrate (both hardware on the test phone and the Mac). */
  videoCodec?: 'h264' | 'h265'
  logLevel?: 'verbose' | 'debug' | 'info' | 'warn' | 'error'
}

export type AudioMode = 'off' | 'mac' | 'both'

export interface ScrcpySessionEvents {
  video: [StreamEvent]
  audio: [StreamEvent]
  deviceMessage: [DeviceMessage]
  log: [string]
  closed: [Error | undefined]
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.once('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address()
      srv.close(() => (addr && typeof addr === 'object' ? resolve(addr.port) : reject(new Error('no port'))))
    })
  })
}

function openSocket(port: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = connect({ host: '127.0.0.1', port, noDelay: true })
    s.once('connect', () => resolve(s))
    s.once('error', reject)
  })
}

export function buildServerArgs(scid: string, o: SessionOptions): string[] {
  const args = [
    `scid=${scid}`,
    `log_level=${o.logLevel ?? 'info'}`,
    'tunnel_forward=true',
    `control=${o.control ?? true}`,
    `video_codec=${o.videoCodec ?? 'h264'}`,
    `stay_awake=${o.stayAwake ?? false}`,
  ]
  const audio = o.audio ?? 'off'
  if (audio === 'off') args.push('audio=false')
  else {
    args.push('audio=true', 'audio_codec=opus')
    if (audio === 'both') args.push('audio_source=playback', 'audio_dup=true')
  }
  if (o.showTouches) args.push('show_touches=true')
  if (o.maxSize) args.push(`max_size=${o.maxSize}`)
  if (o.videoBitRate) args.push(`video_bit_rate=${o.videoBitRate}`)
  if (o.maxFps) args.push(`max_fps=${o.maxFps}`)
  if (o.clipboardAutosync === false) args.push('clipboard_autosync=false')
  return args
}

export class ScrcpySession extends EventEmitter<ScrcpySessionEvents> {
  deviceName = ''
  private closed = false
  private videoReader: SocketReader | null = null

  private constructor(
    private readonly adb: Adb,
    private readonly opts: SessionOptions,
    private readonly port: number,
    private readonly server: ChildProcess,
    private readonly video: Socket,
    private readonly audio: Socket | null,
    private readonly control: Socket | null,
  ) {
    super()
  }

  get serial(): string {
    return this.opts.serial
  }

  /** Latest video size from session packets: touch coordinates must be in this space. */
  videoSize: { width: number; height: number } | null = null

  static async start(adb: Adb, opts: SessionOptions): Promise<ScrcpySession> {
    const { serial } = opts
    const scid = randomInt(0, 0x7fffffff).toString(16).padStart(8, '0')

    await adb.push(serial, opts.serverPath, DEVICE_SERVER_PATH)
    const port = await freePort()
    await adb.forward(serial, port, `localabstract:scrcpy_${scid}`)

    const server = adb.spawn(
      [
        'shell',
        `CLASSPATH=${DEVICE_SERVER_PATH}`,
        'app_process',
        '/',
        'com.genymobile.scrcpy.Server',
        SCRCPY_VERSION,
        ...buildServerArgs(scid, opts),
      ],
      serial,
    )
    const logs: string[] = []
    const onLog = (b: Buffer): void => void logs.push(b.toString())
    server.stdout?.on('data', onLog)
    server.stderr?.on('data', onLog)

    // Every socket opened during the handshake, so a late failure can't leak any of them.
    const opened: Socket[] = []
    const open = async (): Promise<Socket> => {
      const s = await openSocket(port)
      opened.push(s)
      return s
    }

    try {
      // In forward mode connect() succeeds even before the server listens; the dummy
      // byte on the first socket proves the server accepted us. Retry until it arrives.
      let video: Socket | null = null
      let videoReader: SocketReader | null = null
      for (let attempt = 0; attempt < 100 && !video; attempt++) {
        if (server.exitCode !== null) throw new Error(`scrcpy-server exited (${server.exitCode}): ${logs.join('')}`)
        const s = await open().catch(() => null)
        if (s) {
          const reader = new SocketReader(s)
          const ok = await reader.readExact(1).then(() => true, () => false)
          if (ok) {
            video = s
            videoReader = reader
            break
          }
          s.destroy()
        }
        await sleep(100)
      }
      if (!video || !videoReader) throw new Error(`could not connect to scrcpy-server: ${logs.join('')}`)

      // Socket order is fixed by the server: video, audio, control (disabled ones are skipped).
      const audio = (opts.audio ?? 'off') !== 'off' ? await open() : null
      const control = (opts.control ?? true) ? await open() : null
      const session = new ScrcpySession(adb, opts, port, server, video, audio, control)
      session.deviceName = parseDeviceName(await videoReader.readExact(DEVICE_NAME_FIELD_LENGTH))

      server.stdout?.off('data', onLog)
      server.stderr?.off('data', onLog)
      const emitLog = (b: Buffer): void => void session.emit('log', b.toString())
      server.stdout?.on('data', emitLog)
      server.stderr?.on('data', emitLog)
      server.once('exit', (code) => session.close(code ? new Error(`scrcpy-server exited with ${code}`) : undefined))

      session.videoReader = videoReader
      video.once('close', () => session.close())
      return session
    } catch (e) {
      for (const s of opened) s.destroy()
      server.kill()
      await adb.removeForward(serial, port).catch(() => {})
      throw e
    }
  }

  /**
   * Starts emitting 'video' and 'deviceMessage' events. Call this after attaching listeners:
   * bytes already buffered during the handshake (codec id, session packet) flush synchronously.
   */
  begin(): void {
    const reader = this.videoReader
    if (!reader) return
    this.videoReader = null
    const demuxer = new StreamDemuxer()
    reader.pipeTo((chunk) => {
      try {
        for (const ev of demuxer.push(chunk)) {
          if (ev.type === 'session') this.videoSize = { width: ev.width, height: ev.height }
          this.emit('video', ev)
        }
      } catch (e) {
        this.close(e as Error)
      }
    })
    if (this.audio) {
      const audioDemuxer = new StreamDemuxer()
      this.audio.on('data', (chunk: Buffer) => {
        try {
          for (const ev of audioDemuxer.push(chunk)) this.emit('audio', ev)
        } catch (e) {
          this.close(e as Error)
        }
      })
      // Audio may end on its own (e.g. capture unsupported); that should not end the session.
    }
    if (this.control) {
      const parser = new DeviceMessageParser()
      this.control.on('data', (chunk: Buffer) => {
        try {
          for (const m of parser.push(chunk)) this.emit('deviceMessage', m)
        } catch (e) {
          this.close(e as Error)
        }
      })
      this.control.once('close', () => this.close())
    }
  }

  /** Bytes handed to the socket whose write callback hasn't fired yet. */
  private inFlight = 0
  /** Messages held back while the socket is backed up; stale MOVEs coalesce (ControlQueue). */
  private pendingControl = new ControlQueue()

  sendControl(msg: Uint8Array): void {
    if (!this.control || this.closed) return
    // Backed up (Wi-Fi stall): queue instead of piling onto the socket, so stale drag positions
    // collapse into the latest one. Once anything is queued, keep queueing to preserve order.
    if (this.inFlight > CONTROL_HIGH_WATER || this.pendingControl.length) {
      this.pendingControl.push(msg)
      return
    }
    this.writeControl(msg)
  }

  private writeControl(data: Uint8Array): void {
    const control = this.control
    if (!control || this.closed) return
    this.inFlight += data.length
    control.write(data, () => {
      this.inFlight -= data.length
      if (this.inFlight <= CONTROL_HIGH_WATER / 4) {
        const batch = this.pendingControl.drain()
        if (batch) this.writeControl(batch)
      }
    })
  }

  close(error?: Error): void {
    if (this.closed) return
    this.closed = true
    this.video.destroy()
    this.audio?.destroy()
    this.control?.destroy()
    this.server.kill()
    void this.adb.removeForward(this.opts.serial, this.port).catch(() => {})
    this.emit('closed', error)
  }
}
