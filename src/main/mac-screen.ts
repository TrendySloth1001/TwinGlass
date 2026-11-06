// "Show Mac screen on phone": the reverse of mirroring.
//   window (renderer)  getDisplayMedia -> WebCodecs VideoEncoder (hardware H.264, realtime)
//   main (this file)   tiny HTTP server: a viewer page + one long-lived binary stream per viewer
//   phone (Chrome)     fetch() stream -> WebCodecs VideoDecoder -> canvas, full screen
// Over USB the phone reaches the server through `adb reverse` (it just opens localhost), so
// nothing is installed on the phone. The server listens on 127.0.0.1 only, behind a random token.
//
// Stream framing (big-endian): u8 type (0 config JSON, 1 key frame, 2 delta frame),
// f64 timestamp (µs), u32 length, then `length` bytes. H.264 is Annex-B, SPS/PPS inline.
import { randomBytes } from 'node:crypto'
import { createServer, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { app, BrowserWindow, desktopCapturer, ipcMain, session as electronSession, shell, systemPreferences, type WebContents } from 'electron'
import type { Adb } from './adb/adb'
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

async function stop(adb: Adb | null): Promise<void> {
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
            callback(sources[0] ? { video: sources[0] } : {})
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
    permission: process.platform === 'darwin' ? systemPreferences.getMediaAccessStatus('screen') : 'granted',
  }))

  ipcMain.handle('macscreen:start', async (e) => {
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
    sender = e.sender
    server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost')
      if (url.searchParams.get('t') !== token) {
        res.writeHead(403).end('Forbidden')
        return
      }
      if (url.pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }).end(VIEWER_HTML)
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
    const rev = await adb.runLoose(['reverse', `tcp:${port}`, `tcp:${port}`], serial, 8000)
    if (/error|failed/i.test(rev)) {
      await stop(adb)
      throw new Error(`Could not reach the phone: ${rev.trim()}`)
    }
    const url = `http://localhost:${port}/?t=${token}`
    await adb.runLoose(['shell', `am start -a android.intent.action.VIEW -d '${url}'`], serial, 8000)
    return { url }
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
