// "Show Mac screen on phone": the reverse of mirroring.
//   window (renderer)  getDisplayMedia -> WebCodecs VideoEncoder (hardware H.264, realtime)
//   main (this file)   tiny HTTP server: a viewer page + one long-lived binary stream per viewer
//   phone (Chrome)     fetch() stream -> WebCodecs VideoDecoder -> canvas, full screen
// Over USB the phone reaches the server through `adb reverse` (it just opens localhost), so
// nothing is installed on the phone. The server listens on 127.0.0.1 only, behind a random token.
//
// Stream framing (big-endian): u8 type (0 config JSON, 1 key frame, 2 delta frame),
// f64 timestamp (µs), u32 length, then `length` bytes. H.264 is Annex-B, SPS/PPS inline.
import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { createServer, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { app, BrowserWindow, desktopCapturer, ipcMain, session as electronSession, shell, systemPreferences, type WebContents } from 'electron'
import type { Adb } from './adb/adb'
import { holdLandscape } from './adb/rotation'
import { VIEWER_HTML } from './mac-screen-viewer'

interface Viewer {
  res: ServerResponse
  /** Waiting for a key frame (just joined, or frames were dropped while it was slow). */
  needKey: boolean
}

let server: Server | null = null
let token = ''
let port = 0
let serial: string | null = null
let sender: WebContents | null = null
let config: Uint8Array | null = null
/** Extend mode: the virtual display helper and the display it created. */
let displayHelper: ChildProcess | null = null
let extendDisplayId: number | null = null
/** Restores the phone's rotation after extend mode turned it to landscape. */
let restoreRotation: (() => Promise<void>) | null = null
/** Touch -> Mac mouse helper (native/input), started on the first touch. */
let inputHelper: ChildProcess | null = null
let inputTrusted: boolean | null = null

function inputHelperPath(): string {
  const dev = join(app.getAppPath(), 'native/input/mm-input')
  const packaged = join(process.resourcesPath, 'mm-input')
  return app.isPackaged && existsSync(packaged) ? packaged : dev
}

/** Lines of JSON events from the phone -> the helper (which posts CGEvents on the shared display). */
function sendInput(lines: string): void {
  if (!inputHelper || inputHelper.exitCode !== null) {
    const bin = inputHelperPath()
    if (!existsSync(bin)) return
    inputHelper = spawn(bin, [], { stdio: ['pipe', 'pipe', 'ignore'] })
    inputHelper.stdout!.once('data', (b: Buffer) => {
      try {
        inputTrusted = (JSON.parse(b.toString().split('\n')[0]!) as { trusted: boolean }).trusted
        for (const w of BrowserWindow.getAllWindows()) w.webContents.send('macscreen:input-trusted', inputTrusted)
      } catch {
        // ignore
      }
    })
    inputHelper.stdin!.write(`${JSON.stringify({ t: 'display', id: extendDisplayId ?? 0 })}\n`)
  }
  inputHelper.stdin!.write(lines.endsWith('\n') ? lines : `${lines}\n`)
}
export type ShareMode = 'mirror' | 'extend'
/** Latest latency report from the phone page (POST /stats), for the Mac UI. */
let phoneStats: Record<string, number> | null = null
let transport: 'usb' | 'wifi' | null = null
const wallMs = (): number => performance.timeOrigin + performance.now()
const viewers = new Set<Viewer>()

export function frame(type: number, timestampUs: number, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(13 + data.length)
  const v = new DataView(out.buffer)
  v.setUint8(0, type)
  v.setFloat64(1, timestampUs)
  v.setUint32(9, data.length)
  out.set(data, 13)
  return out
}

function requestKey(): void {
  if (sender && !sender.isDestroyed()) sender.send('macscreen:keyframe')
}

function broadcast(type: number, chunk: Uint8Array): void {
  for (const v of viewers) {
    if (type === 2 && v.needKey) continue // a delta is useless before the next key frame
    if (type === 1) v.needKey = false
    // Slow viewer (Wi-Fi hiccup): drop frames instead of buffering seconds of lag, then resume
    // from a fresh key frame once its socket drains.
    if (!v.res.write(chunk)) {
      v.needKey = true
      v.res.once('drain', requestKey)
    }
  }
}

/** The compiled helper (npm run build:native); bundled under Resources when packaged. */
function helperPath(): string {
  const dev = join(app.getAppPath(), 'native/virtual-display/mm-virtual-display')
  const packaged = join(process.resourcesPath, 'mm-virtual-display')
  return app.isPackaged && existsSync(packaged) ? packaged : dev
}

/** `wm size`: "Physical size: 1260x2800" (an "Override size" line wins if present). */
export function parseWmSize(out: string): { width: number; height: number } | null {
  const m = /Override size:\s*(\d+)x(\d+)/.exec(out) ?? /Physical size:\s*(\d+)x(\d+)/.exec(out)
  return m ? { width: Number(m[1]), height: Number(m[2]) } : null
}

/**
 * Virtual display for the phone in landscape, Retina 2x: "looks like" half the phone's pixels,
 * backed by exactly its pixels (2800x1260 phone -> 1400x630 pt display rendered at 2800x1260).
 */
export function extendSize(phone: { width: number; height: number }): { width: number; height: number } {
  const long = Math.max(phone.width, phone.height)
  const short = Math.min(phone.width, phone.height)
  return { width: Math.round(long / 2), height: Math.round(short / 2) }
}

async function createDisplay(size: { width: number; height: number }, name: string): Promise<number> {
  const bin = helperPath()
  if (!existsSync(bin)) throw new Error('The display helper is missing: run npm run build:native')
  // Right of the main screen, vertically centred (the pointer crosses along the middle of that edge).
  const p = spawn(bin, [String(size.width), String(size.height), '60', name, '1', 'right'], { stdio: ['pipe', 'pipe', 'pipe'] })
  displayHelper = p
  const line = await new Promise<string>((resolve, reject) => {
    let out = ''
    const t = setTimeout(() => reject(new Error('The virtual display did not start')), 5000)
    p.stdout!.on('data', (b: Buffer) => {
      out += b.toString()
      const nl = out.indexOf('\n')
      if (nl >= 0) {
        clearTimeout(t)
        resolve(out.slice(0, nl))
      }
    })
    p.once('exit', (code) => {
      clearTimeout(t)
      reject(new Error(`The virtual display helper exited (${code})`))
    })
  })
  const msg = JSON.parse(line) as { displayId?: number; error?: string }
  if (!msg.displayId) throw new Error(msg.error ?? 'macOS refused to create the display')
  return msg.displayId
}

function removeDisplay(): void {
  displayHelper?.stdin?.end() // the helper exits when stdin closes; the display disappears
  const p = displayHelper
  setTimeout(() => p && p.exitCode === null && p.kill(), 1500)
  displayHelper = null
  extendDisplayId = null
}

async function stop(adb: Adb | null): Promise<void> {
  inputHelper?.stdin?.end()
  inputHelper = null
  removeDisplay()
  const restore = restoreRotation
  restoreRotation = null
  await restore?.().catch(() => {})
  for (const v of viewers) v.res.end()
  viewers.clear()
  server?.close()
  server = null
  config = null
  if (sender && !sender.isDestroyed()) sender.send('macscreen:stop')
  sender = null
  if (adb && serial && port) await adb.runLoose(['reverse', '--remove', `tcp:${port}`], serial, 5000)
  serial = null
  port = 0
}

export function registerMacScreenIpc(getAdb: () => Adb | null, getSerial: (wcId: number) => Promise<string | null>): void {
  // getDisplayMedia in the window: pick the main screen without a picker (the user started it).
  // Needs the default session, which exists only once the app is ready.
  void app.whenReady().then(() =>
    electronSession.defaultSession.setDisplayMediaRequestHandler((_req, callback) => {
      // No source = macOS Screen Recording not allowed; macscreen:start checks that first, so
      // this only denies quietly (never throws in main).
      void desktopCapturer.getSources({ types: ['screen'] }).then(
        (sources) => {
          try {
            // Extend mode: the virtual display; mirror mode: the main screen.
            const pick = (extendDisplayId !== null && sources.find((x) => x.display_id === String(extendDisplayId))) || sources[0]
            callback(pick ? { video: pick } : {})
          } catch (err) {
            console.warn('[macscreen] display media denied:', err)
          }
        },
        () => {
          try {
            callback({})
          } catch {
            // already answered
          }
        },
      )
    }),
  )

  ipcMain.handle('macscreen:status', () => ({
    running: server !== null,
    viewers: viewers.size,
    transport,
    phoneStats,
    inputTrusted,
    permission: process.platform === 'darwin' ? systemPreferences.getMediaAccessStatus('screen') : 'granted',
  }))

  ipcMain.handle('macscreen:start', async (e, modeArg: unknown) => {
    const mode: ShareMode = modeArg === 'extend' ? 'extend' : 'mirror'
    const adb = getAdb()
    const target = await getSerial(e.sender.id)
    if (!adb || !target) throw new Error('Connect a phone first.')
    // Without the Screen Recording permission macOS lists no screens (and shows its prompt the
    // first time an app asks). Say so plainly instead of failing deep inside getDisplayMedia.
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } }).catch(() => [])
    if (!sources.length) throw new Error('SCREEN_PERMISSION')
    await stop(adb)
    token = randomBytes(16).toString('hex')
    serial = target
    transport = /^[\w-]+$/.test(target) && !target.includes('._adb-tls') && !/:\d+$/.test(target) ? 'usb' : 'wifi'
    phoneStats = null
    sender = e.sender
    server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost')
      if (url.searchParams.get('t') !== token) {
        res.writeHead(403).end('Forbidden')
        return
      }
      if (url.pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }).end(VIEWER_HTML)
      } else if (url.pathname === '/time') {
        // Clock sync for latency: the phone compares this with its own clock (NTP-style).
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify({ now: wallMs() }))
      } else if (url.pathname === '/stats' && req.method === 'POST') {
        let body = ''
        req.on('data', (c: Buffer) => (body += c.toString()).length > 4096 && req.destroy())
        req.on('end', () => {
          try {
            phoneStats = JSON.parse(body) as Record<string, number>
            for (const w of BrowserWindow.getAllWindows()) w.webContents.send('macscreen:stats', phoneStats)
          } catch {
            // ignore malformed
          }
          res.writeHead(204).end()
        })
      } else if (url.pathname === '/input' && req.method === 'POST') {
        // Touches from the phone (newline-separated JSON events, normalised 0..1 coordinates).
        let body = ''
        req.on('data', (c: Buffer) => (body += c.toString()).length > 64 * 1024 && req.destroy())
        req.on('end', () => {
          const ok = body
            .split('\n')
            .filter((l) => /^\{"t":"(move|down|drag|up|scroll)"/.test(l))
            .join('\n')
          if (ok) sendInput(ok)
          res.writeHead(204).end()
        })
      } else if (url.pathname === '/stream') {
        res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' })
        res.socket?.setNoDelay(true)
        const v: Viewer = { res, needKey: true }
        viewers.add(v)
        if (config) res.write(config)
        requestKey()
        broadcastViewers()
        req.on('close', () => {
          viewers.delete(v)
          broadcastViewers()
        })
      } else res.writeHead(404).end()
    })
    await new Promise<void>((resolve, reject) => {
      server!.once('error', reject)
      server!.listen(0, '127.0.0.1', resolve)
    })
    port = (server.address() as AddressInfo).port
    // The phone's localhost:port -> this Mac's 127.0.0.1:port, through the USB/adb link.
    if (mode === 'extend') {
      const phone = parseWmSize(await adb.runLoose(['shell', 'wm size'], serial, 5000))
      if (!phone) throw new Error('Could not read the phone’s screen size.')
      extendDisplayId = await createDisplay(extendSize(phone), 'Mob Mirror (phone)')
      restoreRotation = await holdLandscape(adb, serial) // the second display is wide
      // Wait until the new screen is capturable (it shows up in desktopCapturer shortly after).
      for (let i = 0; i < 20; i++) {
        const src = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } })
        if (src.some((x) => x.display_id === String(extendDisplayId))) break
        await new Promise((r) => setTimeout(r, 150))
      }
    }
    const rev = await adb.runLoose(['reverse', `tcp:${port}`, `tcp:${port}`], serial, 8000)
    if (/error|failed/i.test(rev)) {
      await stop(adb)
      throw new Error(`Could not reach the phone: ${rev.trim()}`)
    }
    const url = `http://localhost:${port}/?t=${token}`
    await adb.runLoose(['shell', `am start -a android.intent.action.VIEW -d '${url}'`], serial, 8000)
    return { url, mode, displayId: extendDisplayId }
  })

  ipcMain.handle('macscreen:stop', () => stop(getAdb()))
  // macOS: Screen Recording permission lives in System Settings (an app can't grant it itself).
  ipcMain.handle('macscreen:open-privacy', () =>
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'),
  )

  ipcMain.on('macscreen:config', (_e, json: string) => {
    config = frame(0, 0, new TextEncoder().encode(json))
    for (const v of viewers) v.res.write(config)
  })
  ipcMain.on('macscreen:chunk', (_e, type: number, ts: number, data: Uint8Array) => {
    if (!server || !(data instanceof Uint8Array)) return
    broadcast(type === 1 ? 1 : 2, frame(type === 1 ? 1 : 2, ts, data))
  })
}

function broadcastViewers(): void {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('macscreen:viewers', viewers.size)
}

export function stopMacScreen(adb: Adb | null): void {
  void stop(adb)
}
