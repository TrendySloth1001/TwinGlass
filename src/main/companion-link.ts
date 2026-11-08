// Companion link: pairs the phone app with this Mac and lets it check the connection.
// (The base for companion features; Mac screen sharing was removed on 2026-11-06.)
//   Mac   127.0.0.1:LINK_PORT, reached from every connected phone through `adb reverse`
//   key   a per-Mac secret (userData/companion-link.json) handed to the companion app only through
//         adb: an explicit broadcast to its LinkReceiver, which requires the DUMP permission (the adb
//         shell has it, ordinary apps can't get it). Every request must carry it, so other apps on
//         the phone can't start or watch the Mac screen.
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createWriteStream, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { homedir, hostname } from 'node:os'
import { basename, extname, join } from 'node:path'
import { app, clipboard, ipcMain, Notification, shell } from 'electron'
import type { Adb, DeviceList } from './adb/adb'
import { beginExport, deviceIdOf, endExport, ICON_MAX_BYTES, receiveIcon } from './app-icons'
import { onDevicesChanged, trackDevices } from './devices-ipc'
import { adbDetailSections, parseGetprop, type DetailSection } from './adb/parse'

/** The Android companion app (companion/). */
export const COMPANION_PKG = 'com.mobmirror.companion'

export const LINK_PORT = 47123

/** The port this instance listens on: LINK_PORT, or a free one when another Twinglass (e.g. the
 * installed app next to a dev build) already holds it. The phone is told the port on every link. */
let port = LINK_PORT

let key = ''
/** Latest device list (for /link/status). */
let latestDevices: DeviceList | null = null
/** Waiting for POST /link/info (the phone's details) after asking the phone app for them. */
let infoWaiter: ((sections: DetailSection[] | null) => void) | null = null

/** Validates the phone app's JSON: { sections: [{ title, rows: [{ label, value }] }] }, sizes capped. */
export function parseInfoJson(text: string): DetailSection[] | null {
  try {
    const j = JSON.parse(text) as { sections?: unknown }
    if (!Array.isArray(j.sections)) return null
    const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '')
    return j.sections.slice(0, 40).flatMap((s: { title?: unknown; rows?: unknown }) => {
      const title = str(s?.title, 60)
      const rows = Array.isArray(s?.rows)
        ? s.rows.slice(0, 80).map((r: { label?: unknown; value?: unknown }) => ({ label: str(r?.label, 80), value: str(r?.value, 400) })).filter((r) => r.label && r.value)
        : []
      return title && rows.length ? [{ title, rows }] : []
    })
  } catch {
    return null
  }
}
let server: Server | null = null
/** Transport serials already linked (reverse + key sent) in this run. */
const linked = new Set<string>()
const linkedAt = new Map<string, number>()

function loadKey(): string {
  const p = join(app.getPath('userData'), 'companion-link.json')
  try {
    if (existsSync(p)) {
      const k = (JSON.parse(readFileSync(p, 'utf8')) as { key?: string }).key
      if (k && /^[0-9a-f]{64}$/.test(k)) return k
    }
  } catch {
    // regenerate
  }
  const k = randomBytes(32).toString('hex')
  writeFileSync(p, JSON.stringify({ key: k }), { mode: 0o600 })
  return k
}

const keyOk = (k: string | null): boolean => {
  if (!k || k.length !== key.length) return false
  return timingSafeEqual(Buffer.from(k), Buffer.from(key))
}

const macName = (): string => hostname().replace(/\.local$/, '')

const linkFile = (): string => join(app.getPath('userData'), 'companion-link.json')

/** Fallback ports this instance used before (a fresh free port each run): removed from phones. */
let stalePorts: number[] = []

function rememberPort(p: number): void {
  try {
    const j = JSON.parse(readFileSync(linkFile(), 'utf8')) as { key?: string; ports?: number[] }
    stalePorts = (j.ports ?? []).filter((x) => Number.isInteger(x) && x !== p && x !== LINK_PORT)
    writeFileSync(linkFile(), JSON.stringify({ key: j.key, ports: p === LINK_PORT ? [] : [p] }), { mode: 0o600 })
  } catch {
    // no file yet: loadKey writes it
  }
}

/** adb reverse for the link port + hand the key to the companion (if installed). */
async function link(adb: Adb, serial: string, force = false): Promise<boolean> {
  if (linked.has(serial) && !force) return true
  const installed = /package:/.test(await adb.runLoose(['shell', `pm path ${COMPANION_PKG}`], serial, 5000))
  if (!installed) return false
  // Drop forwards to ports this instance listened on in earlier runs (they pile up otherwise).
  for (const old of stalePorts) await adb.runLoose(['reverse', '--remove', `tcp:${old}`], serial, 5000).catch(() => '')
  await adb.runLoose(['reverse', `tcp:${port}`, `tcp:${port}`], serial, 5000)
  const name = macName().replace(/[^\w .-]/g, '')
  const out = await adb.runLoose(
    ['shell', `am broadcast -n ${COMPANION_PKG}/.LinkReceiver --es key ${key} --es mac '${name}' --ei port ${port}`],
    serial,
    5000,
  )
  const ok = /Broadcast completed/.test(out)
  if (ok) {
    linked.add(serial)
    linkedAt.set(serial, Date.now())
  }
  return ok
}

async function linkAll(adb: Adb, list: DeviceList | null): Promise<void> {
  const live = new Set<string>()
  for (const d of list?.devices ?? []) {
    for (const t of d.transports) {
      live.add(t.serial)
      await link(adb, t.serial).catch(() => false)
    }
  }
  for (const s of [...linked]) if (!live.has(s)) linked.delete(s) // re-link when it comes back
}

/** Extra facts for /link/status that live in other modules (sessions, agents); set by index.ts. */
export interface LinkStatusExtras {
  sessions: () => { serial: string; second: boolean; agent: boolean }[]
  agents: () => { enabled: boolean; running: boolean; workspace: string } | null
}

const MAX_FILE = 2 * 1024 * 1024 * 1024
const MAX_TEXT = 1024 * 1024

/** "photo.jpg" → "photo 2.jpg" when taken; strips any path and odd characters. */
function freeName(dir: string, raw: string): string {
  const clean = basename(raw.replace(/\\/g, '/')).replace(/[\x00-\x1f/:*?"<>|]+/g, '_').trim().slice(0, 180) || 'file'
  const ext = extname(clean)
  const stem = clean.slice(0, clean.length - ext.length) || 'file'
  for (let n = 1; n < 1000; n++) {
    const name = n === 1 ? clean : `${stem} ${n}${ext}`
    if (!existsSync(join(dir, name))) return name
  }
  return `${stem} ${Date.now()}${ext}`
}

function notify(title: string, body: string, onClick?: () => void): void {
  if (!Notification.isSupported()) return
  const n = new Notification({ title, body, silent: false })
  if (onClick) n.on('click', onClick)
  n.show()
}

export function startCompanionLink(getAdb: () => Adb | null, extras?: LinkStatusExtras): void {
  key = loadKey()
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const json = (code: number, body: unknown): void => {
      res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(body))
    }
    if (!keyOk(url.searchParams.get('k'))) return json(403, { error: 'not paired' })
    const phoneName = String(req.headers['x-twinglass-phone'] ?? 'Your phone').replace(/[^\w .-]/g, '').slice(0, 40) || 'Your phone'
    if (url.pathname === '/link/status') {
      // What the phone app's "Connected to" screen shows: the Mac, every phone it sees and how,
      // which of them are mirrored (screen / second screens / agent screen), and agent access.
      const list = latestDevices
      const sessions = extras?.sessions() ?? []
      const phones = (list?.devices ?? []).map((d) => {
        const serials = d.transports.map((t) => t.serial)
        const mine = sessions.filter((s) => serials.includes(s.serial))
        return {
          id: d.id,
          model: d.model,
          links: d.transports.map((t) => t.kind),
          mirroring: mine.some((s) => !s.second),
          secondScreens: mine.filter((s) => s.second && !s.agent).length,
          agentScreen: mine.some((s) => s.agent),
        }
      })
      return json(200, {
        mac: macName(),
        version: app.getVersion(),
        os: `macOS ${process.getSystemVersion()}`,
        phones,
        agents: extras?.agents() ?? null,
        time: Date.now(),
      })
    }
    // Share to Mac, text: onto the Mac's clipboard.
    if (req.method === 'POST' && url.pathname === '/link/clipboard') {
      let body = ''
      req.setEncoding('utf8')
      req.on('data', (c: string) => {
        body += c
        if (body.length > MAX_TEXT) req.destroy()
      })
      req.on('end', () => {
        if (!body) return json(400, { error: 'empty' })
        clipboard.writeText(body)
        // notify=0: the phone app's "Notify on the Mac" is off.
        if (url.searchParams.get('notify') !== '0') notify(`Copied from ${phoneName}`, body.length > 120 ? `${body.slice(0, 120)}…` : body)
        json(200, { ok: true })
      })
      return
    }
    // Share to Mac, files: streamed into ~/Downloads/Twinglass.
    if (req.method === 'POST' && url.pathname === '/link/file') {
      const dir = join(homedir(), 'Downloads', 'Twinglass')
      mkdirSync(dir, { recursive: true })
      const name = freeName(dir, url.searchParams.get('name') ?? 'file')
      const path = join(dir, name)
      const out = createWriteStream(path, { flags: 'wx' })
      let size = 0
      let failed = false
      const fail = (code: number, msg: string): void => {
        if (failed) return
        failed = true
        out.destroy()
        try {
          unlinkSync(path)
        } catch {
          // not created
        }
        json(code, { error: msg })
      }
      req.on('data', (c: Buffer) => {
        size += c.length
        if (size > MAX_FILE) {
          req.destroy()
          fail(413, 'too large')
        }
      })
      req.on('aborted', () => fail(400, 'aborted'))
      out.on('error', (e) => fail(500, e.message))
      req.pipe(out)
      out.on('finish', () => {
        if (failed) return
        if (url.searchParams.get('notify') !== '0')
          notify(`${phoneName} sent ${name}`, `Saved to Downloads/Twinglass (${(size / 1024 / 1024).toFixed(1)} MB). Click to show.`, () => shell.showItemInFolder(path))
        json(200, { ok: true, name, size })
      })
      return
    }
    if (req.method === 'POST' && url.pathname === '/link/info') {
      let body = ''
      req.setEncoding('utf8')
      req.on('data', (c: string) => {
        body += c
        if (body.length > 256 * 1024) req.destroy()
      })
      req.on('end', () => {
        const sections = parseInfoJson(body)
        const w = infoWaiter
        infoWaiter = null
        w?.(sections)
        json(w && sections ? 200 : 409, { ok: !!(w && sections) })
      })
      return
    }
    if (req.method === 'POST' && (url.pathname === '/link/icon' || url.pathname === '/link/icons-done')) {
      const chunks: Buffer[] = []
      let size = 0
      req.on('data', (c: Buffer) => {
        size += c.length
        if (size > ICON_MAX_BYTES) req.destroy()
        else chunks.push(c)
      })
      req.on('end', () => {
        const ok = url.pathname === '/link/icon' ? receiveIcon(url.searchParams.get('pkg') ?? '', Buffer.concat(chunks)) : endExport()
        json(ok ? 200 : 409, { ok })
      })
      return
    }
    return json(404, { error: 'unknown' })
  })
  server.on('error', (e: NodeJS.ErrnoException) => {
    if (e.code === 'EADDRINUSE' && port === LINK_PORT) {
      port = 0 // taken by another Twinglass: take any free port instead
      server?.listen(0, '127.0.0.1')
    } else console.error('[companion-link]', e)
  })
  server.on('listening', () => {
    const a = server?.address()
    if (a && typeof a === 'object') port = a.port
    rememberPort(port)
    linked.clear() // (re)link phones with the port we really have
  })
  server.listen(LINK_PORT, '127.0.0.1')

  const adb = getAdb()
  if (adb) void trackDevices(adb).then((l) => ((latestDevices = l), linkAll(adb, l)))
  onDevicesChanged((l) => {
    latestDevices = l
    const a = getAdb()
    if (a) void linkAll(a, l)
  })

  ipcMain.handle('companion:status', async () => {
    const a = getAdb()
    const list = a ? await trackDevices(a).catch(() => null) : null
    const phones = []
    for (const d of list?.devices ?? []) {
      const t = d.transports[0]
      if (!t || !a) continue
      const v = /versionName=(\S+)/.exec(await a.runLoose(['shell', `dumpsys package ${COMPANION_PKG} | grep -m1 versionName`], t.serial, 5000))
      phones.push({ id: d.id, model: d.model, serial: t.serial, installed: !!v, version: v?.[1] ?? null, linked: d.transports.some((x) => linked.has(x.serial)) })
    }
    return { port, phones }
  })
  ipcMain.handle('companion:relink', async () => {
    const a = getAdb()
    if (!a) return false
    linked.clear()
    await linkAll(a, await trackDevices(a))
    return true
  })
  /**
   * Asks the phone app for every launcher icon (they arrive at POST /link/icon). Resolves with the
   * count; throws code "no-companion" when the Twinglass phone app isn't installed.
   */
  ipcMain.handle('apps:fetch-icons', async (_e, serial: unknown) => {
    const a = getAdb()
    if (!a || typeof serial !== 'string') throw new Error('Connect a phone first.')
    if (!(await link(a, serial, true))) throw new Error('no-companion')
    const got = beginExport(await deviceIdOf(a, serial), 45_000)
    // -f 0x20 (FLAG_INCLUDE_STOPPED_PACKAGES): reaches the app even if it was never opened.
    const out = await a.runLoose(['shell', `am broadcast -f 0x20 -n ${COMPANION_PKG}/.IconReceiver --ei size 128`], serial, 5000)
    if (!/Broadcast completed/.test(out)) {
      endExport()
      await got
      throw new Error('The Twinglass phone app did not answer. Update it from Settings → Phone app.')
    }
    return got
  })
  /**
   * Phone details for the Mac's "Phone details" window. From the phone app when it's installed
   * (richer: cameras, sensors, codecs…), else from adb (system properties, battery, memory).
   */
  ipcMain.handle('phone:details', async (_e, serial: unknown) => {
    const a = getAdb()
    if (!a || typeof serial !== 'string') throw new Error('Connect a phone first.')
    return phoneDetails(a, serial)
  })
  /** Installs the bundled companion APK on a phone (dev: companion/app/build/... ; packaged: Resources). */
  ipcMain.handle('companion:install', async (_e, serial: unknown) => {
    const a = getAdb()
    if (!a || typeof serial !== 'string') throw new Error('Connect a phone first.')
    // Prefer the shrunk release build (~2 MB); the debug build (~22 MB) still works.
    const release = join(app.getAppPath(), 'companion/app/build/outputs/apk/release/app-release.apk')
    const dev = existsSync(release) ? release : join(app.getAppPath(), 'companion/app/build/outputs/apk/debug/app-debug.apk')
    const packaged = join(process.resourcesPath, 'mob-mirror-companion.apk')
    const apk = app.isPackaged && existsSync(packaged) ? packaged : dev
    if (!existsSync(apk)) throw new Error('The phone app isn’t built yet: run npm run companion:build')
    const out = (await a.runLoose(['install', '-r', apk], serial, 120_000)).trim()
    if (!/Success/.test(out)) throw new Error(out.split('\n').pop() ?? 'Install failed')
    linked.delete(serial)
    await link(a, serial, true)
    return true
  })
}

export interface PhoneDetails {
  source: 'phone-app' | 'adb'
  appVersion: string | null
  sections: DetailSection[]
}

/**
 * Phone details (Phone details window and the agents' device_info). From the phone app when it's
 * installed (richer: cameras, sensors, codecs…), else from adb (system properties, battery, memory).
 */
export async function phoneDetails(a: Adb, serial: string): Promise<PhoneDetails> {
    const v = /versionName=(\S+)/.exec(await a.runLoose(['shell', `dumpsys package ${COMPANION_PKG} | grep -m1 versionName`], serial, 5000))?.[1] ?? null
  const fromApp = async (): Promise<DetailSection[] | null> => {
    if (!v || infoWaiter || !(await link(a, serial, true))) return null
    const got = new Promise<DetailSection[] | null>((resolve) => {
      const t = setTimeout(() => {
        infoWaiter = null
        resolve(null)
      }, 8000)
      infoWaiter = (s) => {
        clearTimeout(t)
        resolve(s)
      }
    })
    await a.runLoose(['shell', `am broadcast -f 0x20 -n ${COMPANION_PKG}/.InfoReceiver`], serial, 5000)
    return got
  }
  const app = await fromApp().catch(() => null)
  if (app?.length) return { source: 'phone-app' as const, appVersion: v, sections: app }
  const [props = '', bat = '', size = '', dens = '', mem = '', df = ''] = await a.shellBatch(serial, [
    'getprop',
    'dumpsys battery',
    'wm size',
    'wm density',
    'cat /proc/meminfo',
    'df -k /data',
  ])
  return { source: 'adb' as const, appVersion: v, sections: adbDetailSections(parseGetprop(props), bat, size, dens, mem, df) }
}

export function stopCompanionLink(): void {
  server?.close()
  server = null
}
