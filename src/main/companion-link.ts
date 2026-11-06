// Companion link: pairs the phone app with this Mac and lets it check the connection.
// (The base for companion features; Mac screen sharing was removed on 2026-11-06.)
//   Mac   127.0.0.1:LINK_PORT, reached from every connected phone through `adb reverse`
//   key   a per-Mac secret (userData/companion-link.json) handed to the companion app only through
//         adb: an explicit broadcast to its LinkReceiver, which requires the DUMP permission (the adb
//         shell has it, ordinary apps can't get it). Every request must carry it, so other apps on
//         the phone can't start or watch the Mac screen.
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { hostname } from 'node:os'
import { join } from 'node:path'
import { app, ipcMain } from 'electron'
import type { Adb, DeviceList } from './adb/adb'
import { onDevicesChanged, trackDevices } from './devices-ipc'

/** The Android companion app (companion/). */
export const COMPANION_PKG = 'com.mobmirror.companion'

export const LINK_PORT = 47123

let key = ''
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

/** adb reverse for the link port + hand the key to the companion (if installed). */
async function link(adb: Adb, serial: string, force = false): Promise<boolean> {
  if (linked.has(serial) && !force) return true
  const installed = /package:/.test(await adb.runLoose(['shell', `pm path ${COMPANION_PKG}`], serial, 5000))
  if (!installed) return false
  await adb.runLoose(['reverse', `tcp:${LINK_PORT}`, `tcp:${LINK_PORT}`], serial, 5000)
  const name = macName().replace(/[^\w .-]/g, '')
  const out = await adb.runLoose(
    ['shell', `am broadcast -n ${COMPANION_PKG}/.LinkReceiver --es key ${key} --es mac '${name}' --ei port ${LINK_PORT}`],
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

export function startCompanionLink(getAdb: () => Adb | null): void {
  key = loadKey()
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const json = (code: number, body: unknown): void => {
      res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(body))
    }
    if (!keyOk(url.searchParams.get('k'))) return json(403, { error: 'not paired' })
    if (url.pathname === '/link/status') return json(200, { mac: macName(), version: app.getVersion() })
    return json(404, { error: 'unknown' })
  })
  server.on('error', (e) => console.error('[companion-link]', e))
  server.listen(LINK_PORT, '127.0.0.1')

  const adb = getAdb()
  if (adb) void trackDevices(adb).then((l) => linkAll(adb, l))
  onDevicesChanged((l) => {
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
    return { port: LINK_PORT, phones }
  })
  ipcMain.handle('companion:relink', async () => {
    const a = getAdb()
    if (!a) return false
    linked.clear()
    await linkAll(a, await trackDevices(a))
    return true
  })
  /** Installs the bundled companion APK on a phone (dev: companion/app/build/... ; packaged: Resources). */
  ipcMain.handle('companion:install', async (_e, serial: unknown) => {
    const a = getAdb()
    if (!a || typeof serial !== 'string') throw new Error('Connect a phone first.')
    const dev = join(app.getAppPath(), 'companion/app/build/outputs/apk/debug/app-debug.apk')
    const packaged = join(process.resourcesPath, 'mob-mirror-companion.apk')
    const apk = app.isPackaged && existsSync(packaged) ? packaged : dev
    if (!existsSync(apk)) throw new Error('The companion app isn’t built yet: run npm run companion:build')
    const out = (await a.runLoose(['install', '-r', apk], serial, 120_000)).trim()
    if (!/Success/.test(out)) throw new Error(out.split('\n').pop() ?? 'Install failed')
    linked.delete(serial)
    await link(a, serial, true)
    return true
  })
}

export function stopCompanionLink(): void {
  server?.close()
  server = null
}
