// Thin wrapper around the system adb binary (ADR-4: we do not bundle adb).
import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { randomInt } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'
import { promisify } from 'node:util'
import { parseDevicesL, type AdbTransport } from './parse'
import {
  connectSucceeded,
  makeQrPairing,
  pairSucceeded,
  parseInetAddr,
  parseMdnsServices,
  TrackDevicesParser,
  type MdnsService,
  type QrPairing,
} from './wireless'

const execFileP = promisify(execFile)
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export function findAdb(): string | null {
  const candidates = [
    process.env.ADB,
    ...(process.env.PATH ?? '').split(delimiter).map((d) => join(d, 'adb')),
    process.env.ANDROID_HOME && join(process.env.ANDROID_HOME, 'platform-tools', 'adb'),
    process.env.ANDROID_SDK_ROOT && join(process.env.ANDROID_SDK_ROOT, 'platform-tools', 'adb'),
    join(homedir(), 'Library', 'Android', 'sdk', 'platform-tools', 'adb'),
    '/opt/homebrew/bin/adb',
    '/usr/local/bin/adb',
  ]
  for (const c of candidates) if (c && existsSync(c)) return c
  return null
}

export interface Device {
  /** Stable hardware serial (ro.serialno); groups USB + Wi-Fi transports of one phone. */
  id: string
  model: string
  sdk?: number
  /** Preferred transport first (USB, then ip:port, then mDNS names). */
  transports: AdbTransport[]
}

export interface DeviceList {
  devices: Device[]
  /** Transports that are not usable yet (unauthorized, offline...). */
  other: AdbTransport[]
}

export interface OpResult {
  ok: boolean
  message: string
}

export interface AdbStatus {
  adbPath: string
  clientVersion?: string
  serverVersion?: string
  serverPath?: string
  mdnsBackend?: string
}

interface DeviceProps {
  id: string
  sdk?: number
}

export class Adb {
  /** getprop results per transport serial; transports are short-lived, so cache by serial. */
  private props = new Map<string, Promise<DeviceProps>>()

  constructor(readonly path: string) {}

  async run(args: string[], serial?: string, timeoutMs = 15000): Promise<string> {
    const full = serial ? ['-s', serial, ...args] : args
    const { stdout, stderr } = await execFileP(this.path, full, { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 })
    return stdout + stderr
  }

  /** Like run(), but resolves with the combined output even on a non-zero exit. */
  async runLoose(args: string[], serial?: string, timeoutMs = 15000): Promise<string> {
    try {
      return await this.run(args, serial, timeoutMs)
    } catch (e) {
      const err = e as { stdout?: string; stderr?: string; message: string }
      return `${err.stdout ?? ''}${err.stderr ?? ''}` || err.message
    }
  }

  spawn(args: string[], serial?: string): ChildProcess {
    return spawn(this.path, serial ? ['-s', serial, ...args] : args, { stdio: ['ignore', 'pipe', 'pipe'] })
  }

  async status(): Promise<AdbStatus> {
    const s: AdbStatus = { adbPath: this.path }
    const v = await this.runLoose(['version'])
    // "Version 37.0.0-14910828": drop the build number so it compares with server-status' "37.0.0".
    s.clientVersion = /^Version ([\d.]+)/m.exec(v)?.[1]
    const ss = await this.runLoose(['server-status'])
    s.serverVersion = /version: "([^"]+)"/.exec(ss)?.[1]
    s.serverPath = /executable_absolute_path: "([^"]+)"/.exec(ss)?.[1]
    s.mdnsBackend = /mdns_backend: (\S+)/.exec(ss)?.[1]
    return s
  }

  async getprop(serial: string, name: string): Promise<string> {
    return (await this.run(['shell', 'getprop', name], serial)).trim()
  }

  async transports(): Promise<AdbTransport[]> {
    return parseDevicesL(await this.run(['devices', '-l']))
  }

  private deviceProps(serial: string): Promise<DeviceProps> {
    let p = this.props.get(serial)
    if (!p) {
      p = this.run(['shell', 'getprop ro.serialno; getprop ro.build.version.sdk'], serial)
        .then((out) => {
          const [id, sdk] = out.split('\n').map((l) => l.trim())
          return { id: id || serial, sdk: sdk ? Number(sdk) : undefined }
        })
        .catch(() => {
          this.props.delete(serial) // retry next time
          return { id: serial }
        })
      this.props.set(serial, p)
    }
    return p
  }

  /** Groups online transports by phone; drops cached props for transports that vanished. */
  async group(all: AdbTransport[]): Promise<DeviceList> {
    const live = new Set(all.map((t) => t.serial))
    for (const s of this.props.keys()) if (!live.has(s)) this.props.delete(s)

    const other = all.filter((t) => t.state !== 'device')
    const byId = new Map<string, Device>()
    const online = all.filter((t) => t.state === 'device')
    const props = await Promise.all(online.map((t) => this.deviceProps(t.serial)))
    online.forEach((t, i) => {
      const { id, sdk } = props[i]!
      const d = byId.get(id) ?? { id, model: t.model ?? id, sdk, transports: [] }
      d.transports.push(t)
      byId.set(id, d)
    })
    // Preferred first: USB, then the mDNS name (adb re-resolves it, so it survives the phone getting a
    // new IP after a Wi-Fi drop), then raw ip:port (dies on IP change). Alphabetical within a rank.
    const rank = (t: AdbTransport): number => (t.kind === 'usb' ? 0 : /^[\d.[]/.test(t.serial) ? 2 : 1)
    for (const d of byId.values()) d.transports.sort((a, b) => rank(a) - rank(b) || a.serial.localeCompare(b.serial))
    const devices = [...byId.values()].sort((a, b) => a.model.localeCompare(b.model) || a.id.localeCompare(b.id))
    return { devices, other }
  }

  async devices(): Promise<DeviceList> {
    return this.group(await this.transports())
  }

  push(serial: string, local: string, remote: string): Promise<string> {
    return this.run(['push', local, remote], serial, 60000)
  }

  forward(serial: string, localPort: number, remote: string): Promise<string> {
    return this.run(['forward', `tcp:${localPort}`, remote], serial)
  }

  removeForward(serial: string, localPort: number): Promise<string> {
    return this.run(['forward', '--remove', `tcp:${localPort}`], serial)
  }

  // ---- wireless ----

  async pair(hostPort: string, code: string): Promise<OpResult> {
    const out = (await this.runLoose(['pair', hostPort, code], undefined, 30000)).trim()
    return { ok: pairSucceeded(out), message: out }
  }

  async connect(hostPort: string): Promise<OpResult> {
    const out = (await this.runLoose(['connect', hostPort], undefined, 20000)).trim()
    return { ok: connectSucceeded(out), message: out }
  }

  async disconnect(serial: string): Promise<OpResult> {
    const out = (await this.runLoose(['disconnect', serial])).trim()
    return { ok: !/error|no such/i.test(out), message: out }
  }

  async mdnsServices(): Promise<MdnsService[]> {
    return parseMdnsServices(await this.runLoose(['mdns', 'services']))
  }

  /**
   * Legacy wireless (works on any Android version, required for Android 10 and below):
   * restart adbd in TCP mode over USB, then connect to the phone's Wi-Fi IP. Unencrypted.
   */
  async enableTcpip(serial: string, port = 5555): Promise<OpResult> {
    const ip = parseInetAddr(await this.runLoose(['shell', 'ip -f inet addr show wlan0'], serial))
    if (!ip) return { ok: false, message: 'The phone has no Wi-Fi IPv4 address. Connect it to the same Wi-Fi as this Mac.' }
    const out = await this.runLoose(['tcpip', String(port)], serial)
    if (/error/i.test(out)) return { ok: false, message: out.trim() }
    let last: OpResult = { ok: false, message: '' }
    for (let i = 0; i < 8; i++) {
      await sleep(750) // adbd restarts; the first attempts usually get "connection refused"
      last = await this.connect(`${ip}:${port}`)
      if (last.ok) return last
    }
    return last
  }

  /**
   * QR pairing (Android 11+): show `payload` as a QR code, then wait until the phone
   * advertises `_adb-tls-pairing._tcp` under our service name, and pair with the password.
   */
  qrPairing(): QrPairingSession {
    return new QrPairingSession(this, makeQrPairing((max) => randomInt(0, max)))
  }

  /** Live device list via `adb track-devices -l`; restarts if the adb server goes away. */
  track(): DeviceTracker {
    return new DeviceTracker(this)
  }
}

export type QrState =
  | { state: 'waiting' }
  | { state: 'pairing'; hostPort: string }
  | { state: 'paired'; message: string }
  | { state: 'error'; message: string }

export class QrPairingSession extends EventEmitter<{ state: [QrState] }> {
  private cancelled = false

  constructor(
    private readonly adb: Adb,
    readonly qr: QrPairing,
  ) {
    super()
  }

  cancel(): void {
    this.cancelled = true
  }

  async run(timeoutMs = 120_000): Promise<void> {
    this.emit('state', { state: 'waiting' })
    const deadline = Date.now() + timeoutMs
    while (!this.cancelled && Date.now() < deadline) {
      const svc = (await this.adb.mdnsServices()).find(
        (s) => s.name === this.qr.name && s.type === '_adb-tls-pairing._tcp',
      )
      if (svc) {
        const hostPort = `${svc.host}:${svc.port}`
        this.emit('state', { state: 'pairing', hostPort })
        const r = await this.adb.pair(hostPort, this.qr.password)
        this.emit('state', r.ok ? { state: 'paired', message: r.message } : { state: 'error', message: r.message })
        return
      }
      await sleep(1000)
    }
    if (!this.cancelled) {
      this.emit('state', {
        state: 'error',
        message: 'Timed out. The phone was not found on the network (check that it is on the same Wi-Fi), or the QR code was not scanned.',
      })
    }
  }
}

export class DeviceTracker extends EventEmitter<{ change: [DeviceList]; error: [Error] }> {
  private proc: ChildProcess | null = null
  private stopped = false
  private seq = 0

  constructor(private readonly adb: Adb) {
    super()
    this.start()
  }

  private start(): void {
    if (this.stopped) return
    const parser = new TrackDevicesParser()
    const proc = this.adb.spawn(['track-devices', '-l'])
    this.proc = proc
    proc.stdout?.setEncoding('utf8')
    proc.stdout?.on('data', (chunk: string) => {
      let frames: string[]
      try {
        frames = parser.push(chunk)
      } catch (e) {
        this.emit('error', e as Error)
        proc.kill()
        return
      }
      for (const f of frames) void this.publish(parseDevicesL(f))
    })
    proc.once('exit', () => {
      if (this.proc === proc) this.proc = null
      if (!this.stopped) setTimeout(() => this.start(), 1000)
    })
  }

  /** Grouping needs getprop calls; drop results that a newer frame has overtaken. */
  private async publish(transports: AdbTransport[]): Promise<void> {
    const n = ++this.seq
    const list = await this.adb.group(transports)
    if (n === this.seq) this.emit('change', list)
  }

  stop(): void {
    this.stopped = true
    this.proc?.kill()
  }
}
