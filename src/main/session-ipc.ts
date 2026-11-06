// Bridges a ScrcpySession to one renderer over a dedicated MessagePort.
// Electron's MessagePortMain can't transfer ArrayBuffers, so packets are structured-cloned.
// At a few Mbps of H.264 that copy is negligible.
import { statSync } from 'node:fs'
import { basename, extname, isAbsolute } from 'node:path'
import { clipboard, ipcMain, MessageChannelMain, webContents, type WebContents } from 'electron'
import { scanFile } from '@shared/scrcpy/control'
import type { Adb } from './adb/adb'
import { ScrcpySession } from './scrcpy/session'
import { isLocked } from './unlock-ipc'
import type { FileResult, MainToRenderer, RendererToMain, StartSessionRequest } from '../shared/ipc'

const sessions = new Map<number, ScrcpySession>()
/**
 * Bumped on every start/stop/destroy of a window. A start that finishes after its generation
 * was superseded (user pressed Disconnect, picked another device, or closed the window while
 * "Starting mirror…" was showing) closes its session instead of going live.
 */
const generation = new Map<number, number>()
const watched = new Set<number>()

function bump(id: number): number {
  const g = (generation.get(id) ?? 0) + 1
  generation.set(id, g)
  return g
}

/** Sessions closed on purpose (Disconnect, new device, window closed): no auto-reconnect. */
const intentional = new WeakSet<ScrcpySession>()

function stop(webContentsId: number): void {
  bump(webContentsId)
  const s = sessions.get(webContentsId)
  if (s) {
    intentional.add(s)
    s.close()
  }
  sessions.delete(webContentsId)
}

/**
 * Wi-Fi links can die silently (verified in the adb log: "SSL_read failed: Operation timed out"
 * after the router deauthenticated the phone), leaving sockets hanging for minutes. Ping the
 * transport; two failed pings in a row = connection lost, so the renderer can reconnect quickly.
 */
function startWatchdog(adb: Adb, session: ScrcpySession): () => void {
  let misses = 0
  let busy = false
  const timer = setInterval(() => {
    if (busy) return
    busy = true
    adb
      .run(['get-state'], session.serial, 3000)
      .then((out) => {
        misses = out.trim() === 'device' ? 0 : misses + 1
      })
      .catch(() => {
        misses++
      })
      .finally(() => {
        busy = false
        if (misses >= 2) session.close(new Error('Connection to the phone was lost'))
      })
  }, 4000)
  return () => clearInterval(timer)
}

/** Registers cleanup once per window, before any await, so closing mid-start is never missed. */
function watch(wc: WebContents): void {
  if (watched.has(wc.id)) return
  watched.add(wc.id)
  const id = wc.id
  wc.once('destroyed', () => {
    stop(id)
    watched.delete(id)
    generation.delete(id)
  })
  // A reload (Cmd+R) drops the renderer's port; the old session must not keep running.
  wc.on('did-start-navigation', (details) => {
    if (details.isMainFrame && !details.isSameDocument) stop(id)
  })
}

export function registerSessionIpc(getAdb: () => Adb | null, serverPath: () => string): void {
  ipcMain.handle('session:start', async (e, req: StartSessionRequest) => {
    const adb = getAdb()
    if (!adb) throw new Error('adb not found')
    const wc: WebContents = e.sender
    watch(wc)
    stop(wc.id)
    const gen = bump(wc.id)

    const session = await ScrcpySession.start(adb, {
      serial: req.serial,
      serverPath: serverPath(),
      maxSize: req.maxSize,
      videoBitRate: req.videoBitRate,
      maxFps: req.maxFps,
      videoCodec: req.videoCodec === 'h265' ? 'h265' : 'h264',
      audio: req.audio ?? 'off',
      showTouches: req.showTouches === true,
      stayAwake: true,
    })
    if (wc.isDestroyed() || generation.get(wc.id) !== gen) {
      session.close()
      throw new Error('cancelled')
    }
    sessions.set(wc.id, session)

    const { port1, port2 } = new MessageChannelMain()
    const post = (m: MainToRenderer): void => port1.postMessage(m)

    session.on('video', (ev) => post({ t: 'video', ev, at: performance.timeOrigin + performance.now() }))
    session.on('audio', (ev) => post({ t: 'audio', ev }))
    session.on('deviceMessage', (msg) => {
      // The device clipboard changed (autosync, or after GET_CLIPBOARD): mirror it to the Mac.
      if (msg.type === 'clipboard') clipboard.writeText(msg.text)
      post({ t: 'device', msg })
    })
    session.on('log', (line) => post({ t: 'log', line }))

    // Lock-screen state for the "Phone is locked" banner (the PIN bouncer itself is black in the
    // mirror). `dumpsys window policy` is ~3 KB / ~70 ms, polled every 2.5 s, sent only on change.
    let lastLocked: boolean | null = null
    let polling = false
    const lockTimer = setInterval(() => {
      if (polling) return
      polling = true
      void isLocked(adb, session.serial)
        .then((locked) => {
          if (locked !== null && locked !== lastLocked) {
            lastLocked = locked
            post({ t: 'lock', locked })
          }
        })
        .finally(() => (polling = false))
    }, 2500)

    const stopWatchdog = startWatchdog(adb, session)
    session.once('closed', (err) => {
      clearInterval(lockTimer)
      stopWatchdog()
      post({ t: 'closed', error: err?.message, unexpected: !intentional.has(session) })
      port1.close()
      if (sessions.get(wc.id) === session) sessions.delete(wc.id)
    })

    port1.on('message', ({ data }: { data: RendererToMain }) => {
      if (data.t === 'control') session.sendControl(data.data)
      else if (data.t === 'stop') session.close()
    })
    port1.start()
    session.begin()

    wc.postMessage('session:port', { deviceName: session.deviceName }, [port2])
    return { deviceName: session.deviceName }
  })

  ipcMain.handle('session:stop', (e) => stop(e.sender.id))

  // Drag & drop onto the mirror: APKs are installed, anything else goes to /sdcard/Download.
  // Paths come from preload (webUtils.getPathForFile on real dropped File objects); still validate.
  ipcMain.handle('files:drop', async (e, paths: unknown): Promise<FileResult[]> => {
    const adb = getAdb()
    const session = sessions.get(e.sender.id)
    if (!adb || !session) return [{ name: '', ok: false, message: 'Start mirroring a device first.' }]
    if (!Array.isArray(paths)) return []
    const results: FileResult[] = []
    for (const p of paths) {
      if (typeof p !== 'string' || !isAbsolute(p)) {
        results.push({ name: String(p), ok: false, message: 'not a dropped file' })
        continue
      }
      const name = basename(p)
      try {
        if (!statSync(p).isFile()) throw new Error('folders are not supported')
        if (extname(p).toLowerCase() === '.apk') {
          const out = (await adb.runLoose(['install', '-r', p], session.serial, 300_000)).trim()
          const ok = /\bSuccess\b/.test(out)
          results.push({ name, ok, message: ok ? 'installed' : out.split('\n').pop() || out })
        } else {
          const dest = `/sdcard/Download/${name}`
          await adb.push(session.serial, p, dest)
          session.sendControl(scanFile(dest))
          results.push({ name, ok: true, message: `copied to ${dest}` })
        }
      } catch (err) {
        results.push({ name, ok: false, message: err instanceof Error ? err.message : String(err) })
      }
    }
    return results
  })
  ipcMain.handle('clipboard:read', () => clipboard.readText())
  ipcMain.handle('clipboard:write', (_e, text: string) => clipboard.writeText(String(text)))
}

export function getSession(webContentsId: number): ScrcpySession | undefined {
  return sessions.get(webContentsId)
}

let captureSeq = 0
const captureWaiters = new Map<number, (png: Uint8Array | null) => void>()
ipcMain.on('agent:capture-result', (_e, id: number, png: Uint8Array | null) => {
  captureWaiters.get(id)?.(png instanceof Uint8Array ? png : null)
  captureWaiters.delete(id)
})

/** Asks a mirror window for its current decoded frame as PNG (fast path for agent screenshots). */
function captureFrom(wcId: number): Promise<Uint8Array | null> {
  const wc = webContents.fromId(wcId)
  if (!wc || wc.isDestroyed()) return Promise.resolve(null)
  const id = ++captureSeq
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      captureWaiters.delete(id)
      resolve(null) // fall back to adb screencap
    }, 1500)
    captureWaiters.set(id, (png) => {
      clearTimeout(timer)
      resolve(png)
    })
    wc.send('agent:capture', id)
  })
}

/** Live mirror session for any of a phone's transports (USB / Wi-Fi), for agent control. */
export function findSessionBySerials(
  serials: string[],
): { session: ScrcpySession; capture: () => Promise<Uint8Array | null> } | null {
  for (const [wcId, session] of sessions) {
    if (serials.includes(session.serial)) return { session, capture: () => captureFrom(wcId) }
  }
  return null
}

export function stopAllSessions(): void {
  for (const id of [...sessions.keys()]) stop(id)
}
