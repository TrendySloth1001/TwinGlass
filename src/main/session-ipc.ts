// Bridges a ScrcpySession to one renderer over a dedicated MessagePort.
// Electron's MessagePortMain can't transfer ArrayBuffers, so packets are structured-cloned.
// At a few Mbps of H.264 that copy is negligible.
import { statSync } from 'node:fs'
import { basename, extname, isAbsolute } from 'node:path'
import { clipboard, ipcMain, MessageChannelMain, type WebContents } from 'electron'
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

function stop(webContentsId: number): void {
  bump(webContentsId)
  sessions.get(webContentsId)?.close()
  sessions.delete(webContentsId)
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

    session.once('closed', (err) => {
      clearInterval(lockTimer)
      post({ t: 'closed', error: err?.message })
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

export function stopAllSessions(): void {
  for (const id of [...sessions.keys()]) stop(id)
}
