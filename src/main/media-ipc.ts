// Screenshots and recordings, saved to ~/Pictures/Twinglass (screenshots) and ~/Movies/Twinglass (videos).
import { closeSync, mkdirSync, openSync, readdirSync, statSync, writeSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { app, ipcMain, nativeImage, shell, type WebContents } from 'electron'

interface Recording {
  fd: number
  path: string
  /** Owning window: only it may write to / stop this recording. */
  senderId: number
}

const recordings = new Map<number, Recording>()
const watched = new Set<number>()
let nextId = 1

/** "A024 2026-11-06 15-42-07" (no characters that are awkward in Finder or shells). */
export function mediaBaseName(deviceName: string, date = new Date()): string {
  const safe = deviceName.replace(/[^\w .-]+/g, '_').trim() || 'Android'
  const p = (n: number): string => String(n).padStart(2, '0')
  const stamp = `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}-${p(date.getMinutes())}-${p(date.getSeconds())}`
  return `${safe} ${stamp}`
}

function dir(kind: 'pictures' | 'videos'): string {
  const d = join(app.getPath(kind), 'Twinglass')
  mkdirSync(d, { recursive: true })
  return d
}

/** Opens a new file exclusively; adds " 2", " 3"… instead of overwriting (two shots in one second). */
function openUnique(folder: string, base: string, ext: string): { fd: number; path: string } {
  for (let n = 1; n < 1000; n++) {
    const path = join(folder, `${base}${n === 1 ? '' : ` ${n}`}.${ext}`)
    try {
      return { fd: openSync(path, 'wx'), path }
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e
    }
  }
  throw new Error('could not find a free file name')
}

function closeRecording(id: number): string | null {
  const r = recordings.get(id)
  if (!r) return null
  recordings.delete(id)
  try {
    closeSync(r.fd)
  } catch {
    // already closed
  }
  return r.path
}

function closeRecordingsOf(senderId: number): void {
  for (const [id, r] of recordings) if (r.senderId === senderId) closeRecording(id)
}

/** Closes a window's recording files when it closes or reloads (React never unmounts then). */
function watch(wc: WebContents): void {
  if (watched.has(wc.id)) return
  watched.add(wc.id)
  const id = wc.id
  wc.once('destroyed', () => {
    closeRecordingsOf(id)
    watched.delete(id)
  })
  wc.on('did-start-navigation', (details) => {
    if (details.isMainFrame && !details.isSameDocument) closeRecordingsOf(id)
  })
}

function owned(id: unknown, senderId: number): Recording | null {
  const r = typeof id === 'number' ? recordings.get(id) : undefined
  return r && r.senderId === senderId ? r : null
}

/** Our capture folders, including the ones from before the rename (older captures stay there). */
function captureFolders(): { path: string; kind: 'image' | 'video' }[] {
  return [
    { path: join(app.getPath('pictures'), 'Twinglass'), kind: 'image' },
    { path: join(app.getPath('videos'), 'Twinglass'), kind: 'video' },
    { path: join(app.getPath('pictures'), 'Mob Mirror'), kind: 'image' },
    { path: join(app.getPath('videos'), 'Mob Mirror'), kind: 'video' },
  ]
}

/** Only files inside our capture folders may be opened or revealed from the renderer. */
function isCapture(target: string): boolean {
  return captureFolders().some(({ path }) => {
    const rel = relative(path, target)
    return rel !== '' && !rel.startsWith('..') && !rel.startsWith('/')
  })
}

/** Saves a PNG to ~/Pictures/Twinglass with a unique name; returns the path. */
export function saveScreenshotPng(png: Uint8Array, deviceName: string): string {
  const { fd, path } = openUnique(dir('pictures'), mediaBaseName(deviceName), 'png')
  try {
    writeSync(fd, png)
  } finally {
    closeSync(fd)
  }
  return path
}

export function registerMediaIpc(): void {
  // Home screen "Recent captures": newest screenshots and recordings with Quick Look thumbnails.
  ipcMain.handle('media:recent', async (_e, limit: unknown) => {
    const n = typeof limit === 'number' ? Math.min(Math.max(limit, 1), 24) : 6
    const files: { path: string; name: string; kind: 'image' | 'video'; at: number }[] = []
    for (const f of captureFolders()) {
      let names: string[] = []
      try {
        names = readdirSync(f.path)
      } catch {
        continue
      }
      for (const name of names) {
        if (!/\.(png|jpe?g|webm|mp4|mov)$/i.test(name)) continue
        const path = join(f.path, name)
        try {
          files.push({ path, name, kind: f.kind, at: statSync(path).mtimeMs })
        } catch {
          // vanished
        }
      }
    }
    files.sort((a, b) => b.at - a.at)
    return Promise.all(
      files.slice(0, n).map(async (f) => {
        const thumb = await nativeImage.createThumbnailFromPath(f.path, { width: 360, height: 360 }).catch(() => null)
        return { ...f, thumb: thumb && !thumb.isEmpty() ? thumb.toDataURL() : null }
      }),
    )
  })
  ipcMain.handle('media:open', (_e, path: unknown) => {
    if (typeof path === 'string' && isCapture(resolve(path))) return shell.openPath(resolve(path))
    return 'not a capture'
  })

  ipcMain.handle('media:screenshot', (_e, png: Uint8Array, deviceName: string) => saveScreenshotPng(png, String(deviceName)))

  ipcMain.handle('media:record:start', (e, deviceName: string, ext: string) => {
    watch(e.sender)
    const safeExt = ext === 'mp4' ? 'mp4' : 'webm'
    const { fd, path } = openUnique(dir('videos'), mediaBaseName(String(deviceName)), safeExt)
    const id = nextId++
    recordings.set(id, { fd, path, senderId: e.sender.id })
    return id
  })

  ipcMain.handle('media:record:chunk', (e, id: unknown, chunk: Uint8Array) => {
    const r = owned(id, e.sender.id)
    if (!r) throw new Error('unknown recording')
    writeSync(r.fd, chunk)
  })

  ipcMain.handle('media:record:stop', (e, id: unknown) => {
    const r = owned(id, e.sender.id)
    return r ? closeRecording(id as number) : null
  })

  // Only reveal files we saved ourselves.
  // Settings → Advanced: open where screenshots / recordings are saved.
  ipcMain.handle('media:open-folder', (_e, kind: unknown) => {
    const d = join(app.getPath(kind === 'videos' ? 'videos' : 'pictures'), 'Twinglass')
    mkdirSync(d, { recursive: true })
    return shell.openPath(d)
  })
  ipcMain.handle('media:reveal', (_e, path: unknown) => {
    if (typeof path !== 'string') return
    const target = resolve(path)
    if (isCapture(target)) shell.showItemInFolder(target)
  })
}

export function closeAllRecordings(): void {
  for (const id of [...recordings.keys()]) closeRecording(id)
}
