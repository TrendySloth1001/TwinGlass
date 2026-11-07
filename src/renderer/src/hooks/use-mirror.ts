// Owns one mirroring session: MessagePort, video decoder, audio player, input and recorder.
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { toast } from 'sonner'
import type { AudioMode, MainToRenderer, RendererToMain } from '@shared/ipc'
import { videoParams, type CodecPreference, type Quality } from '@shared/quality'
import { AndroidKey } from '@shared/input/keycodes'
import { expandNotificationPanel, expandSettingsPanel, resetVideo, setDisplayPower } from '@shared/scrcpy/control'
import type { DeviceAction } from '@shared/shortcuts'
import type { DeviceInfo, TransportInfo } from '../../../preload/api'
import { AudioPlayer } from '@/engine/audio-player'
import { InputController, type InputOptions } from '@/engine/input'
import { backoffDelay } from '@shared/util/backoff'
import { Recorder } from '@/engine/recorder'
import { TouchOverlay } from '@/engine/touch-overlay'
import { notify } from '@/lib/notify'
import { VideoView, type VideoStats } from '@/engine/video-view'

/** `reconnecting`: the link died unexpectedly (Wi-Fi drop, cable pulled); retrying automatically. */
export type Phase = 'idle' | 'connecting' | 'live' | 'reconnecting'

export interface MirrorState {
  phase: Phase
  transport: TransportInfo | null
  deviceName: string
  stats: VideoStats | null
  audio: AudioPlayer['state'] | 'off'
  muted: boolean
  screenOff: boolean
  recordingSince: number | null
  /** Lock screen showing on the phone (null = unknown yet). The PIN screen itself is black. */
  locked: boolean | null
  /** Package whose app-lock PIN prompt is in front (phone unlocked), if recognised. */
  appPrompt: string | null
  /** While reconnecting: attempt number and why the link dropped. */
  reconnect: { attempt: number; reason: string } | null
}

const IDLE: MirrorState = {
  phase: 'idle',
  transport: null,
  deviceName: '',
  stats: null,
  audio: 'off',
  muted: false,
  screenOff: false,
  recordingSince: null,
  locked: null,
  appPrompt: null,
  reconnect: null,
}

/** How long to keep trying after an unexpected drop (the router deauth + rejoin seen in the logs takes seconds). */
const RECONNECT_WINDOW_MS = 90_000

interface Engine {
  port: MessagePort
  video: VideoView
  input: InputController
  audio: AudioPlayer | null
  recorder: Recorder
  overlay: TouchOverlay | null
  timer: number
}

/** Waits for the session MessagePort forwarded by preload; `cancel` removes the listener. */
function waitForPort(): { promise: Promise<{ port: MessagePort; deviceName: string }>; cancel: () => void } {
  let onMessage: (e: MessageEvent) => void = () => {}
  const promise = new Promise<{ port: MessagePort; deviceName: string }>((resolve) => {
    onMessage = (e: MessageEvent): void => {
      if (e.source !== window || e.data?.type !== 'mob-mirror:session-port' || !e.ports[0]) return
      window.removeEventListener('message', onMessage)
      resolve({ port: e.ports[0], deviceName: e.data.deviceName as string })
    }
    window.addEventListener('message', onMessage)
  })
  return { promise, cancel: () => window.removeEventListener('message', onMessage) }
}

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e))

export interface ConnectOptions {
  audio: AudioMode
  showTouches: boolean
  /** Hardware id (ro.serialno): lets a reconnect find the phone on another transport (USB/Wi-Fi). */
  deviceId?: string
  quality: Quality
  codec: CodecPreference
  /** 0 = no cap (the quality preset decides). */
  maxFps?: number
  stayAwake?: boolean
  clipboardSync?: boolean
  /** Second screen: a new virtual display (phone-shaped), optionally opening this app on it. */
  secondScreen?: { app?: string }
}

/** Can this Mac hardware-decode HEVC? (verified true on Apple Silicon / Electron 45). Cached. */
let hevcSupport: Promise<boolean> | null = null
function macDecodesHevc(): Promise<boolean> {
  hevcSupport ??= VideoDecoder.isConfigSupported({ codec: 'hvc1.1.6.L153.B0', hardwareAcceleration: 'prefer-hardware' }).then(
    (r) => r.supported === true,
    () => false,
  )
  return hevcSupport
}

export interface Mirror {
  state: MirrorState
  connect: (t: TransportInfo, opts: ConnectOptions) => Promise<void>
  /** Restart the live session with changed options (quality, codec, audio, show touches). */
  restart: (patch: Partial<ConnectOptions>) => Promise<void>
  /** Runs a Device menu / toolbar action (no-op unless live). */
  runAction: (action: DeviceAction) => void
  disconnect: () => void
  send: (msg: Uint8Array) => void
  pressKey: (keycode: number) => void
  toggleScreenOff: () => void
  toggleMute: () => void
  screenshot: () => Promise<void>
  toggleRecording: () => Promise<void>
  /** Turns the touch dots on the mirror on/off immediately (no restart). */
  setShowTouches: (on: boolean) => void
  /** Mouse buttons / scroll direction and speed, applied instantly. */
  setInputOptions: (patch: Partial<InputOptions>) => void
  /** Whether an unexpected drop starts the reconnect loop (instant). */
  setAutoReconnect: (on: boolean) => void
}

export function useMirror(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  overlayRef: RefObject<HTMLDivElement | null>,
): Mirror {
  const [state, setState] = useState<MirrorState>(IDLE)
  const engine = useRef<Engine | null>(null)
  const busy = useRef(false)
  /** Latest request that arrived while a connect was in flight: run it next instead of dropping it. */
  const queued = useRef<{ t: TransportInfo; opts: ConnectOptions } | null>(null)
  /** "Show touches" draws the app's own dots on the mirror; changes apply instantly. */
  const showTouches = useRef(false)
  /** Mouse buttons / scroll preferences, applied to the live input controller without a restart. */
  /** Settings → Connection → Reconnect automatically (read when a link drops). */
  const autoReconnect = useRef(true)
  const inputOptions = useRef<InputOptions>({ mouseShortcuts: true, invertScroll: false, scrollSpeed: 1 })
  const attempt = useRef(0)
  const patch = useCallback((p: Partial<MirrorState>) => setState((s) => ({ ...s, ...p })), [])
  // Latest state for callbacks (side effects stay out of setState updaters: StrictMode runs them twice).
  const stateRef = useRef(state)
  stateRef.current = state

  const teardown = useCallback(
    (notifyMain: boolean) => {
      const e = engine.current
      if (!e) return
      engine.current = null
      window.mobMirror.setFrameCapture(null)
      clearInterval(e.timer)
      if (e.recorder.active) void e.recorder.stop()
      e.input.dispose()
      e.overlay?.dispose()
      e.video.dispose()
      e.audio?.dispose()
      if (notifyMain) e.port.postMessage({ t: 'stop' } satisfies RendererToMain)
      e.port.close()
      setState(IDLE)
    },
    [],
  )

  const send = useCallback((data: Uint8Array) => {
    engine.current?.port.postMessage({ t: 'control', data } satisfies RendererToMain)
  }, [])

  // Set below; lets the port's "closed" handler start a reconnect without a dependency cycle.
  const reconnectRef = useRef<(t: TransportInfo, opts: ConnectOptions, reason: string) => void>(() => {})
  const connectRef = useRef<(t: TransportInfo, opts: ConnectOptions) => Promise<void>>(async () => {})

  /**
   * One connection attempt. `mode: 'reconnect'` keeps the reconnecting UI, stays quiet on errors and
   * reuses the caller's generation, so Disconnect/another Mirror click still cancels it.
   */
  const connectOnce = useCallback(
    async (t: TransportInfo, opts: ConnectOptions, gen: number, mode: 'fresh' | 'reconnect'): Promise<boolean> => {
      const audioMode = opts.audio
      const canvas = canvasRef.current
      if (!canvas) return false
      if (mode === 'fresh') {
        if (busy.current) {
          queued.current = { t, opts }
          return false
        }
        busy.current = true
        teardown(true)
        setState({ ...IDLE, phase: 'connecting', transport: t })
      }
      const wait = waitForPort()
      try {
        const wantHevc = opts.codec === 'h265' || (opts.codec === 'auto' && (await macDecodesHevc()))
        const request = {
          serial: t.serial,
          audio: audioMode,
          ...videoParams(opts.quality, t.kind),
          ...(opts.maxFps ? { maxFps: opts.maxFps } : {}),
          stayAwake: opts.stayAwake ?? true,
          clipboardAutosync: opts.clipboardSync ?? true,
          // 1080x2400 @ 420 dpi: phone-shaped (same 9:20 as most phones), sharp, light to encode.
          ...(opts.secondScreen ? { newDisplay: { width: 1080, height: 2400, dpi: 420 }, startApp: opts.secondScreen.app } : {}),
        }
        try {
          await window.mobMirror.startSession({ ...request, videoCodec: wantHevc ? 'h265' : 'h264' })
        } catch (e) {
          // Phones without an HEVC encoder make the server fail: fall back to H.264 once ("auto" only).
          if (!wantHevc || opts.codec !== 'auto' || gen !== attempt.current) throw e
          await window.mobMirror.startSession({ ...request, videoCodec: 'h264' })
        }
        const { port, deviceName } = await wait.promise
        if (gen !== attempt.current) {
          port.close()
          return false
        }

        const post = (data: Uint8Array): void => port.postMessage({ t: 'control', data } satisfies RendererToMain)
        const video = new VideoView(
          canvas,
          (e) => console.warn('[video] decoder error, recovering:', e.message), // recovers by itself: no toast spam
          () => {},
          () => post(resetVideo()),
        )
        const audio = audioMode === 'off' ? null : new AudioPlayer((e) => toast.error(`Audio: ${e.message}`))
        const overlay = overlayRef.current ? new TouchOverlay(overlayRef.current, canvas) : null
        const input = new InputController(canvas, () => video.size, post, (points, size) =>
          points.length && showTouches.current ? overlay?.show(points, size) : overlay?.clear(),
        )
        input.options = inputOptions.current
        const recorder = new Recorder()

        port.onmessage = ({ data }: MessageEvent<MainToRenderer>) => {
          if (data.t === 'video') video.handle(data.ev, data.at)
          else if (data.t === 'audio') audio?.handle(data.ev)
          else if (data.t === 'log') console.debug('[scrcpy]', data.line.trimEnd())
          else if (data.t === 'lock') patch({ locked: data.locked, appPrompt: data.appPrompt })
          else if (data.t === 'closed') {
            teardown(false)
            if (data.unexpected && autoReconnect.current) reconnectRef.current(t, opts, data.error ?? 'The connection closed')
            else if (data.error) notify('error', 'Disconnected', { description: data.error })
            else toast('Disconnected')
          }
        }
        port.start()

        const timer = window.setInterval(() => {
          patch({ stats: video.stats(), audio: audio ? audio.state : 'off' })
        }, 1000)

        engine.current = { port, video, input, audio, recorder, overlay, timer }
        // Fast agent screenshots: hand main the current decoded frame instead of `adb screencap`.
        window.mobMirror.setFrameCapture(
          () =>
            new Promise((resolve) =>
              canvas.toBlob((b) => (b ? void b.arrayBuffer().then((a) => resolve(new Uint8Array(a))) : resolve(null)), 'image/png'),
            ),
        )
        setState({ ...IDLE, phase: 'live', transport: t, deviceName, audio: audio ? 'waiting' : 'off' })
        canvas.focus()
        return true
      } catch (e) {
        wait.cancel()
        if (gen !== attempt.current) return false // cancelled by the user: not an error
        if (mode === 'fresh') {
          setState(IDLE)
          notify('error', 'Could not start mirroring', { description: errMsg(e) })
        }
        return false
      } finally {
        if (mode === 'fresh') {
          busy.current = false
          const next = queued.current
          queued.current = null
          if (next) void connectRef.current(next.t, next.opts)
        }
      }
    },
    [canvasRef, overlayRef, patch, teardown],
  )

  /** Transport + options of the current/last session, for restarting with new settings. */
  const last = useRef<{ t: TransportInfo; opts: ConnectOptions } | null>(null)

  const connect = useCallback(
    async (t: TransportInfo, opts: ConnectOptions): Promise<void> => {
      last.current = { t, opts }
      showTouches.current = opts.showTouches
      // Disconnect (or unmount, or a reconnect loop) is cancelled by bumping this.
      const gen = ++attempt.current
      await connectOnce(t, opts, gen, 'fresh')
    },
    [connectOnce],
  )

  connectRef.current = connect

  const setShowTouches = useCallback((on: boolean) => {
    showTouches.current = on
    if (last.current) last.current = { ...last.current, opts: { ...last.current.opts, showTouches: on } }
    if (!on) engine.current?.overlay?.clear()
  }, [])

  /** Mouse-button and scroll preferences: instant (the live controller reads the same object). */
  const setInputOptions = useCallback((patch: Partial<InputOptions>) => {
    inputOptions.current = { ...inputOptions.current, ...patch }
    if (engine.current) engine.current.input.options = inputOptions.current
  }, [])

  const setAutoReconnect = useCallback((on: boolean) => {
    autoReconnect.current = on
  }, [])

  /** Applies new session settings now: restarts the live mirror on the same transport (~1 s). */
  const restart = useCallback(
    async (patch: Partial<ConnectOptions>): Promise<void> => {
      const l = last.current
      if (!l || stateRef.current.phase !== 'live') return
      await connect(stateRef.current.transport ?? l.t, { ...l.opts, ...patch })
    },
    [connect],
  )

  /**
   * After an unexpected drop: wait for the phone to come back on any transport (USB preferred, then
   * the Wi-Fi mDNS name that survives IP changes) and restart the mirror, for up to 90 s.
   */
  const reconnect = useCallback(
    (lost: TransportInfo, opts: ConnectOptions, reason: string) => {
      const gen = ++attempt.current
      const started = Date.now()
      setState({ ...IDLE, phase: 'reconnecting', transport: lost, reconnect: { attempt: 0, reason } })
      void (async () => {
        const match = (devices: DeviceInfo[]): DeviceInfo | undefined =>
          devices.find((d) => (opts.deviceId && d.id === opts.deviceId) || d.transports.some((x) => x.serial === lost.serial))
        for (let n = 1; Date.now() - started < RECONNECT_WINDOW_MS; n++) {
          // Event-driven: retry the moment adb reports the phone again (USB replug, Wi-Fi rejoin),
          // with exponential backoff + jitter as the fallback when no event comes.
          await new Promise<void>((resolve) => {
            const timer = setTimeout(done, backoffDelay(n - 1, 500, 4000))
            const off = window.mobMirror.onDevicesChanged((l) => {
              if (match(l.devices)) done()
            })
            function done(): void {
              clearTimeout(timer)
              off()
              resolve()
            }
          })
          if (gen !== attempt.current) return
          patch({ reconnect: { attempt: n, reason } })
          const { devices } = await window.mobMirror.listDevices().catch(() => ({ devices: [] as DeviceInfo[] }))
          const dev = match(devices)
          const next = dev?.transports[0]
          if (!next) continue
          if (await connectOnce(next, { ...opts, deviceId: dev.id }, gen, 'reconnect')) {
            notify('success', 'Reconnected', { description: `via ${next.kind === 'usb' ? 'USB' : 'Wi-Fi'} (${next.serial})` })
            return
          }
        }
        if (gen !== attempt.current) return
        setState(IDLE)
        notify('error', 'Connection lost', {
          description: `${reason}. The phone didn’t come back within 90 s (check its Wi-Fi or the cable).`,
          action: { label: 'Retry', run: () => void connect(lost, opts) },
        })
      })()
    },
    [connect, connectOnce, patch],
  )
  reconnectRef.current = reconnect

  const disconnect = useCallback(() => {
    attempt.current++
    teardown(true)
    setState(IDLE) // also leaves the "connecting" phase, which teardown() doesn't cover
    void window.mobMirror.stopSession()
  }, [teardown])

  const pressKey = useCallback((keycode: number) => engine.current?.input.pressKey(keycode), [])

  // (stateRef is declared at the top of the hook: side effects stay out of setState updaters.)

  const toggleScreenOff = useCallback(() => {
    const off = !stateRef.current.screenOff
    send(setDisplayPower(!off))
    patch({ screenOff: off })
  }, [patch, send])

  const toggleMute = useCallback(() => {
    const muted = !stateRef.current.muted
    if (engine.current?.audio) engine.current.audio.muted = muted
    patch({ muted })
  }, [patch])

  const screenshot = useCallback(async () => {
    const canvas = canvasRef.current
    if (!canvas || !engine.current) return
    try {
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'))
      if (!blob) throw new Error('nothing to capture yet')
      const path = await window.mobMirror.saveScreenshot(new Uint8Array(await blob.arrayBuffer()), state.deviceName)
      toast.success('Screenshot saved', {
        description: path,
        action: { label: 'Show in Finder', onClick: () => void window.mobMirror.reveal(path) },
      })
    } catch (e) {
      toast.error('Screenshot failed', { description: errMsg(e) })
    }
  }, [canvasRef, state.deviceName])

  const toggleRecording = useCallback(async () => {
    const e = engine.current
    const canvas = canvasRef.current
    if (!e || !canvas) return
    try {
      if (e.recorder.active) {
        patch({ recordingSince: null })
        const path = await e.recorder.stop()
        if (path) {
          toast.success('Recording saved', {
            description: path,
            action: { label: 'Show in Finder', onClick: () => void window.mobMirror.reveal(path) },
          })
        }
      } else {
        await e.recorder.start(canvas, e.audio?.stream ?? null, state.deviceName)
        patch({ recordingSince: Date.now() })
      }
    } catch (err) {
      patch({ recordingSince: null })
      toast.error('Recording failed', { description: errMsg(err) })
    }
  }, [canvasRef, patch, state.deviceName])

  useEffect(
    () => () => {
      attempt.current++
      teardown(true)
    },
    [teardown],
  )

  // Latest callbacks for runAction, so the menu subscription never sees stale closures.
  const actions = useRef({ disconnect, toggleScreenOff, screenshot, toggleRecording })
  actions.current = { disconnect, toggleScreenOff, screenshot, toggleRecording }

  const runAction = useCallback(
    (action: DeviceAction) => {
      if (!engine.current) return
      const a = actions.current
      const key = (k: number): void => engine.current?.input.pressKey(k)
      switch (action) {
        case 'back':
          return key(AndroidKey.BACK)
        case 'home':
          return key(AndroidKey.HOME)
        case 'recents':
          return key(AndroidKey.APP_SWITCH)
        case 'notifications':
          return send(expandNotificationPanel())
        case 'quickSettings':
          return send(expandSettingsPanel())
        case 'power':
          return key(AndroidKey.POWER)
        case 'volumeUp':
          return key(AndroidKey.VOLUME_UP)
        case 'volumeDown':
          return key(AndroidKey.VOLUME_DOWN)
        case 'rotate':
          return void window.mobMirror.rotateDevice().catch((err: unknown) =>
            notify('error', 'Couldn’t rotate the phone', { description: errMsg(err) }),
          )
        case 'screenOff':
          return a.toggleScreenOff()
        case 'screenshot':
          return void a.screenshot()
        case 'record':
          return void a.toggleRecording()
        case 'disconnect':
          return a.disconnect()
        case 'unlock':
        case 'unlockManual':
          return // needs UI (secret entry): handled by the app's unlock dialog
      }
    },
    [send],
  )

  return {
    state,
    connect,
    restart,
    runAction,
    disconnect,
    send,
    pressKey,
    toggleScreenOff,
    toggleMute,
    screenshot,
    toggleRecording,
    setShowTouches,
    setInputOptions,
    setAutoReconnect,
  }
}
