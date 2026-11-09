// Twinglass "Wi-Fi, no setup" server: phones running the Twinglass app pair with a 6-digit code
// and stream their screen here without developer mode (protocol.ts). The phone starts a mirror
// like casting ("Mirror to Mac" + Android's consent); this side opens a window for it.
import { spawn, type ChildProcess } from 'node:child_process'
import { createECDH, randomBytes, randomInt } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { createReadStream, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createServer as createHttpServer } from 'node:http'
import { createServer, type Server, type Socket } from 'node:net'
import { hostname, networkInterfaces } from 'node:os'
import QRCode from 'qrcode'
import { join } from 'node:path'
import { app } from 'electron'
import { bundledPhoneApp, phoneAppOutdated } from '../bundled-phone-app'
import { StreamDemuxer, type StreamEvent } from '@shared/scrcpy/stream'
import { DIRECT_PORT, FrameReader, hmac, Kind, Opener, pairKey, pairSecret, plainFrame, safeEqual, Sealer, sessionKeys } from './protocol'

export interface PairedPhone {
  id: string
  name: string
  model: string
  secret: string
  pairedAt: number
  lastSeen: number
}

export interface DirectPhoneInfo {
  id: string
  name: string
  model: string
  online: boolean
  /** The phone asked to mirror and is waiting for a window. */
  offering: boolean
  mirroring: boolean
  pairedAt: number
  lastSeen: number
}

const store = (): string => join(app.getPath('userData'), 'direct-phones.json')
const macName = (): string => hostname().replace(/\.local$/, '')

function loadPhones(): Map<string, PairedPhone> {
  try {
    if (existsSync(store())) {
      const list = JSON.parse(readFileSync(store(), 'utf8')) as PairedPhone[]
      return new Map(list.filter((p) => typeof p.id === 'string' && typeof p.secret === 'string').map((p) => [p.id, p]))
    }
  } catch {
    // corrupt: start empty (phones pair again)
  }
  return new Map()
}

/** A mirror over the direct link: same surface as ScrcpySession for session-ipc. */
export class DirectSession extends EventEmitter<{ video: [StreamEvent]; audio: [StreamEvent]; deviceMessage: [never]; log: [string]; closed: [Error | undefined] }> {
  readonly displaySize = null
  videoSize: { width: number; height: number } | null = null
  private closed = false
  private demux = new StreamDemuxer()

  constructor(
    readonly serial: string,
    readonly deviceName: string,
    private readonly conn: Conn,
  ) {
    super()
  }

  begin(): void {
    this.conn.attach(this)
    this.conn.send(Kind.JSON, Buffer.from(JSON.stringify({ t: 'go' })))
  }

  /** Video bytes from the phone (scrcpy stream framing). */
  feed(chunk: Buffer): void {
    for (const ev of this.demux.push(chunk)) {
      if (ev.type === 'session') this.videoSize = { width: ev.width, height: ev.height }
      this.emit('video', ev)
    }
  }

  sendControl(msg: Uint8Array): void {
    if (!this.closed) this.conn.send(Kind.CONTROL, msg)
  }

  close(err?: Error): void {
    if (this.closed) return
    this.closed = true
    this.conn.detach(this)
    this.emit('closed', err)
  }
}

type ConnState = 'plain' | 'pairing' | 'session'

/** One phone connection. */
class Conn {
  state: ConnState = 'plain'
  phone: PairedPhone | null = null
  private reader = new FrameReader()
  private sealer: Sealer | null = null
  private opener: Opener | null = null
  private pair: { ecdh: ReturnType<typeof createECDH>; key: Buffer | null; id: string; name: string; model: string } | null = null
  session: DirectSession | null = null
  offering = false

  constructor(
    readonly socket: Socket,
    private readonly srv: DirectServer,
  ) {
    socket.setNoDelay(true)
    socket.on('data', (d: Buffer) => {
      try {
        for (const f of this.reader.push(d)) this.onFrame(f)
      } catch (e) {
        this.fail(e instanceof Error ? e.message : String(e))
      }
    })
    socket.on('close', () => this.srv.dropped(this))
    socket.on('error', () => {})
    socket.setTimeout(20_000, () => this.state !== 'session' && socket.destroy())
  }

  private plain(msg: object): void {
    this.socket.write(plainFrame(msg))
  }

  fail(error: string): void {
    if (this.state !== 'session') this.plain({ t: 'error', error })
    this.socket.end()
    this.socket.destroy()
  }

  send(kind: number, payload: Uint8Array): void {
    if (this.sealer && !this.socket.destroyed) this.socket.write(this.sealer.seal(kind, payload))
  }

  attach(s: DirectSession): void {
    this.session = s
    this.offering = false
    this.srv.changed()
  }

  detach(s: DirectSession): void {
    if (this.session !== s) return
    this.session = null
    this.send(Kind.JSON, Buffer.from(JSON.stringify({ t: 'stop' })))
    this.srv.changed()
  }

  private onFrame(f: Buffer): void {
    if (this.state === 'session') return this.onSealed(f)
    const msg = JSON.parse(f.toString('utf8')) as Record<string, string>
    const str = (k: string, max = 80): string => (typeof msg[k] === 'string' ? msg[k]!.slice(0, max) : '')
    if (this.state === 'plain' && msg.t === 'pair') {
      const id = str('id', 64)
      if (!/^[\w-]{8,64}$/.test(id)) return this.fail('bad id')
      const ecdh = createECDH('prime256v1')
      ecdh.generateKeys()
      let shared: Buffer
      try {
        shared = ecdh.computeSecret(Buffer.from(str('pub', 200), 'base64'))
      } catch {
        return this.fail('bad key')
      }
      const code = this.srv.code()
      if (!code) return this.fail('pairing-closed')
      this.pair = { ecdh, key: pairKey(shared, code), id, name: str('name') || 'Android phone', model: str('model') }
      this.state = 'pairing'
      return this.plain({ t: 'pair', pub: ecdh.getPublicKey().toString('base64'), mac: macName() })
    }
    if (this.state === 'pairing' && msg.t === 'confirm' && this.pair?.key) {
      const ok = safeEqual(Buffer.from(str('mac', 100), 'base64'), hmac(this.pair.key, 'phone'))
      if (!ok) {
        this.srv.wrongCode()
        return this.fail('code')
      }
      const { id, name, model, key } = this.pair
      this.srv.paired({ id, name, model, secret: pairSecret(key).toString('base64'), pairedAt: Date.now(), lastSeen: Date.now() })
      this.plain({ t: 'confirm', mac: hmac(key, 'mac').toString('base64') })
      return void this.socket.end()
    }
    if (this.state === 'plain' && msg.t === 'hello') {
      const phone = this.srv.phone(str('id', 64))
      if (!phone) return this.fail('unknown')
      const phoneNonce = Buffer.from(str('nonce', 64), 'base64')
      if (phoneNonce.length !== 16) return this.fail('bad nonce')
      const macNonce = randomBytes(16)
      const keys = sessionKeys(Buffer.from(phone.secret, 'base64'), phoneNonce, macNonce)
      this.opener = new Opener(keys.up)
      this.sealer = new Sealer(keys.down)
      this.phone = phone
      this.plain({ t: 'hello', nonce: macNonce.toString('base64'), mac: macName() })
      this.state = 'session'
      this.socket.setTimeout(0)
      this.srv.online(this)
      // The phone runs an older phone app than the one bundled here: tell it (Home shows "Update").
      const code = Number(msg.appCode)
      const bundled = bundledPhoneApp()
      if (bundled && phoneAppOutdated(Number.isInteger(code) ? code : null)) this.send(Kind.JSON, Buffer.from(JSON.stringify({ t: 'update', version: bundled.version, code: bundled.code })))
      return
    }
    this.fail('protocol')
  }

  private onSealed(f: Buffer): void {
    const { kind, payload } = this.opener!.open(f)
    if (kind === Kind.VIDEO) return this.session?.feed(payload)
    if (kind !== Kind.JSON) return
    const msg = JSON.parse(payload.toString('utf8')) as { t?: string }
    if (msg.t === 'offer') {
      // The phone wants to mirror (the user tapped "Mirror to Mac" and allowed it).
      this.offering = true
      this.srv.offered(this)
    } else if (msg.t === 'stopped') {
      this.offering = false
      this.session?.close(new Error('Mirroring stopped on the phone'))
      this.srv.changed()
    } else if (msg.t === 'forget') {
      // Forgotten on the phone (authenticated by this session): forget it here too.
      this.srv.forget(this.phone!.id, false)
    } else if (msg.t === 'get-update') {
      // "Update" on the phone: serve the bundled phone app on the LAN for a while and send the URL
      // (the phone hands it to its browser, then Android's installer takes over).
      const b = bundledPhoneApp()
      if (!b) return this.send(Kind.JSON, Buffer.from(JSON.stringify({ t: 'update-url', error: 'no app' })))
      void openApkDownload(b.path, 10 * 60_000).then((r) =>
        this.send(Kind.JSON, Buffer.from(JSON.stringify(r ? { t: 'update-url', url: r.url, version: b.version } : { t: 'update-url', error: 'no network' }))),
      )
    } else if (msg.t === 'ping') this.send(Kind.JSON, Buffer.from(JSON.stringify({ t: 'pong' })))
  }
}

export class DirectServer extends EventEmitter<{ changed: []; offer: [serial: string] }> {
  private server: Server | null = null
  private advertiser: ChildProcess | null = null
  private phones = loadPhones()
  private conns = new Map<string, Conn>()
  private pairing: { code: string; until: number; tries: number } | null = null

  start(): void {
    if (this.server) return
    this.server = createServer((s) => new Conn(s, this))
    this.server.on('error', (e) => console.error('[direct]', e))
    this.server.listen(DIRECT_PORT, '0.0.0.0', () => this.advertise())
  }

  /** mDNS via macOS' own dns-sd (no extra dependency): phones list this Mac by name. */
  private advertise(): void {
    try {
      this.advertiser = spawn('/usr/bin/dns-sd', ['-R', macName(), '_twinglass._tcp', 'local', String(DIRECT_PORT), 'v=1'], { stdio: 'ignore' })
      this.advertiser.on('error', () => (this.advertiser = null))
    } catch {
      this.advertiser = null
    }
  }

  stop(): void {
    this.advertiser?.kill()
    this.advertiser = null
    for (const c of this.conns.values()) c.socket.destroy()
    this.server?.close()
    this.server = null
  }

  // ---- pairing ----

  /** Shows a fresh 6-digit code for 5 minutes (3 tries). */
  openPairing(): { code: string; until: number } {
    this.pairing = { code: String(randomInt(0, 1_000_000)).padStart(6, '0'), until: Date.now() + 5 * 60_000, tries: 0 }
    return { code: this.pairing.code, until: this.pairing.until }
  }

  closePairing(): void {
    this.pairing = null
  }

  code(): string | null {
    if (!this.pairing || Date.now() > this.pairing.until) return null
    return this.pairing.code
  }

  wrongCode(): void {
    if (this.pairing && ++this.pairing.tries >= 3) this.pairing = null // a new code is needed
    this.emit('changed')
  }

  paired(p: PairedPhone): void {
    this.phones.set(p.id, p)
    this.save()
    this.pairing = null
    this.emit('changed')
  }

  /**
   * Forgets a phone here and, when it's connected, tells it to forget this Mac too (else it learns
   * on its next connection: the Mac answers "unknown" and the phone drops the pairing).
   * Returns whether the phone was told right away.
   */
  forget(id: string, tellPhone = true): boolean {
    const c = this.conns.get(id)
    this.phones.delete(id)
    this.conns.delete(id)
    this.save()
    let told = false
    if (c) {
      c.session?.close(new Error('This phone was forgotten'))
      if (tellPhone) {
        c.send(Kind.JSON, Buffer.from(JSON.stringify({ t: 'forget' })))
        told = true
      }
      c.socket.end() // flushes the message, then closes
      setTimeout(() => c.socket.destroy(), 1000)
    }
    this.emit('changed')
    return told
  }

  private save(): void {
    writeFileSync(store(), JSON.stringify([...this.phones.values()]), { mode: 0o600 })
  }

  phone(id: string): PairedPhone | null {
    return this.phones.get(id) ?? null
  }

  // ---- connections ----

  online(c: Conn): void {
    const p = c.phone!
    this.conns.get(p.id)?.socket.destroy() // a newer connection replaces an old one
    this.conns.set(p.id, c)
    p.lastSeen = Date.now()
    this.save()
    this.emit('changed')
  }

  dropped(c: Conn): void {
    if (c.phone && this.conns.get(c.phone.id) === c) this.conns.delete(c.phone.id)
    c.session?.close(new Error('The phone disconnected'))
    this.emit('changed')
  }

  offered(c: Conn): void {
    this.emit('changed')
    this.emit('offer', `direct:${c.phone!.id}`)
  }

  changed(): void {
    this.emit('changed')
  }

  /** A session for a phone that offered its screen (session-ipc calls this for "direct:<id>"). */
  attach(serial: string): DirectSession {
    const id = serial.replace(/^direct:/, '')
    const c = this.conns.get(id)
    if (!c) throw new Error('That phone isn’t connected. Open Twinglass on the phone and tap “Mirror to Mac”.')
    if (!c.offering && !c.session) throw new Error('Tap “Mirror to Mac” on the phone first (Android asks you to allow it).')
    c.session?.close()
    return new DirectSession(serial, c.phone!.name, c)
  }

  list(): DirectPhoneInfo[] {
    return [...this.phones.values()].map((p) => {
      const c = this.conns.get(p.id)
      return { id: p.id, name: p.name, model: p.model, online: !!c, offering: !!c?.offering, mirroring: !!c?.session, pairedAt: p.pairedAt, lastSeen: p.lastSeen }
    })
  }

  pairingState(): { code: string; until: number } | null {
    const c = this.code()
    return c ? { code: c, until: this.pairing!.until } : null
  }
}

export const directServer = new DirectServer()

// ---- "Get the app": the Mac serves the phone app's APK on the Wi-Fi while the Add phone sheet is open ----

const APK_PORT = 47201
let apkServer: import('node:http').Server | null = null

function lanAddress(): string | null {
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.')) return a.address
  }
  return null
}

/**
 * Serves `apk` at http://<Mac LAN IP>:47201/Twinglass.apk until closed; returns the URL and a QR.
 * One QR does both: the phone's camera opens the URL (downloads the app); Twinglass' own "Scan QR"
 * reads the pairing details from the query (?pair=<code>&port=…&mac=…) and pairs with no typing.
 */
let apkCloseTimer: ReturnType<typeof setTimeout> | null = null

export async function openApkDownload(apk: string, closeAfterMs = 0): Promise<{ url: string; qr: string } | null> {
  closeApkDownload()
  if (closeAfterMs > 0) apkCloseTimer = setTimeout(closeApkDownload, closeAfterMs)
  const ip = lanAddress()
  if (!ip || !existsSync(apk)) return null
  const size = statSync(apk).size
  apkServer = createHttpServer((req, res) => {
    if (new URL(req.url ?? '/', 'http://x').pathname !== '/Twinglass.apk') return void res.writeHead(404).end()
    res.writeHead(200, { 'Content-Type': 'application/vnd.android.package-archive', 'Content-Length': size, 'Content-Disposition': 'attachment; filename="Twinglass.apk"' })
    createReadStream(apk).pipe(res)
  })
  await new Promise<void>((r) => apkServer!.listen(APK_PORT, '0.0.0.0', () => r()))
  const url = `http://${ip}:${APK_PORT}/Twinglass.apk`
  const code = directServer.code()
  const full = code ? `${url}?pair=${code}&port=${DIRECT_PORT}&mac=${encodeURIComponent(hostname().replace(/\.local$/, ''))}` : url
  return { url, qr: await QRCode.toDataURL(full, { margin: 1, width: 360, errorCorrectionLevel: 'M' }) }
}

export function closeApkDownload(): void {
  if (apkCloseTimer) clearTimeout(apkCloseTimer)
  apkCloseTimer = null
  apkServer?.close()
  apkServer = null
}
