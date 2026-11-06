// Screenshots and recordings, saved to ~/Pictures/Mob Mirror (screenshots) and ~/Movies/Mob Mirror (videos).
import { closeSync, mkdirSync, openSync, writeSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { app, ipcMain, shell, type WebContents } from 'electron'

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
  const d = join(app.getPath(kind), 'Mob Mirror')
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

export function registerMediaIpc(): void {
  ipcMain.handle('media:screenshot', (_e, png: Uint8Array, deviceName: string) => {
    const { fd, path } = openUnique(dir('pictures'), mediaBaseName(String(deviceName)), 'png')
    try {
      writeSync(fd, png)
    } finally {
      closeSync(fd)
    }
    return path
  })

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
  ipcMain.handle('media:reveal', (_e, path: unknown) => {
    if (typeof path !== 'string') return
    const target = resolve(path)
    const inside = (folder: string): boolean => {
      const rel = relative(join(app.getPath(folder === 'p' ? 'pictures' : 'videos'), 'Mob Mirror'), target)
      return rel !== '' && !rel.startsWith('..') && !rel.startsWith('/')
    }
    if (inside('p') || inside('v')) shell.showItemInFolder(target)
  })
}

export function closeAllRecordings(): void {
  for (const id of [...recordings.keys()]) closeRecording(id)
}
