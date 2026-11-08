// Real app icons for the app grid and ⌘K, sent by the Twinglass phone app (companion IconReceiver)
// over the companion link, and cached per phone in userData/app-icons/<device id>/<package>.png.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import type { Adb } from './adb/adb'
import { trackDevices } from './devices-ipc'

export const ICON_MAX_BYTES = 512 * 1024
const PKG_RE = /^[A-Za-z][\w]*(\.[\w]+)+$/

/** A folder-safe name for a device id ("A024-ab12cd"); ids come from adb. */
export function iconFolderName(deviceId: string): string {
  return deviceId.replace(/[^\w.-]+/g, '_').slice(0, 80) || 'phone'
}

export function isPackageName(pkg: string): boolean {
  return pkg.length <= 255 && PKG_RE.test(pkg)
}

/** PNG signature check: only real PNGs land in the cache. */
export function isPng(b: Uint8Array): boolean {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  return b.length > sig.length && sig.every((x, i) => b[i] === x)
}

const dirFor = (deviceId: string): string => join(app.getPath('userData'), 'app-icons', iconFolderName(deviceId))

/** Stable per-phone key: the same phone over USB and Wi-Fi shares one icon cache. */
export async function deviceIdOf(adb: Adb, serial: string): Promise<string> {
  const list = await trackDevices(adb).catch(() => null)
  return list?.devices.find((d) => d.transports.some((t) => t.serial === serial))?.id ?? serial
}

/** pkg → data URL, for the packages that have a cached icon. */
export function readIcons(deviceId: string): Map<string, string> {
  const out = new Map<string, string>()
  const d = dirFor(deviceId)
  let names: string[] = []
  try {
    names = readdirSync(d)
  } catch {
    return out
  }
  for (const n of names) {
    if (!n.endsWith('.png')) continue
    try {
      out.set(n.slice(0, -4), `data:image/png;base64,${readFileSync(join(d, n)).toString('base64')}`)
    } catch {
      // vanished
    }
  }
  return out
}

/** The export in progress: icons POSTed by the phone go to its folder. One at a time. */
let pending: { deviceId: string; count: number; done: (n: number) => void } | null = null

export function beginExport(deviceId: string, timeoutMs: number): Promise<number> {
  if (pending) return Promise.reject(new Error('Already loading icons.'))
  mkdirSync(dirFor(deviceId), { recursive: true })
  return new Promise<number>((resolve) => {
    const timer = setTimeout(() => finish(), timeoutMs)
    const finish = (): void => {
      clearTimeout(timer)
      const n = pending?.count ?? 0
      pending = null
      resolve(n)
    }
    pending = { deviceId, count: 0, done: finish }
  })
}

/** POST /link/icon from the phone. false = no export running or a bad request. */
export function receiveIcon(pkg: string, png: Uint8Array): boolean {
  if (!pending || !isPackageName(pkg) || !isPng(png) || png.length > ICON_MAX_BYTES) return false
  writeFileSync(join(dirFor(pending.deviceId), `${pkg}.png`), png)
  pending.count++
  return true
}

/** POST /link/icons-done from the phone. */
export function endExport(): boolean {
  if (!pending) return false
  pending.done(pending.count)
  return true
}

export const hasIcons = (deviceId: string): boolean => existsSync(dirFor(deviceId)) && readIcons(deviceId).size > 0
