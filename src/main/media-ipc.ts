// Screenshots and recordings, saved to ~/Pictures/Mob Mirror (screenshots) and ~/Movies/Mob Mirror (videos).
import { closeSync, mkdirSync, openSync, writeSync } from 'node:fs'
import { join } from 'node:path'
import { app, ipcMain, shell } from 'electron'

const recordings = new Map<number, { fd: number; path: string }>()
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

export function registerMediaIpc(): void {
  ipcMain.handle('media:screenshot', (_e, png: Uint8Array, deviceName: string) => {
    const path = join(dir('pictures'), `${mediaBaseName(deviceName)}.png`)
    const fd = openSync(path, 'w')
    writeSync(fd, png)
    closeSync(fd)
    return path
  })

  ipcMain.handle('media:record:start', (_e, deviceName: string, ext: string) => {
    const safeExt = ext === 'mp4' ? 'mp4' : 'webm'
    const path = join(dir('videos'), `${mediaBaseName(deviceName)}.${safeExt}`)
    const id = nextId++
    recordings.set(id, { fd: openSync(path, 'w'), path })
    return id
  })

  ipcMain.handle('media:record:chunk', (_e, id: number, chunk: Uint8Array) => {
    const r = recordings.get(id)
    if (r) writeSync(r.fd, chunk)
  })

  ipcMain.handle('media:record:stop', (_e, id: number) => {
    const r = recordings.get(id)
    if (!r) return null
    closeSync(r.fd)
    recordings.delete(id)
    return r.path
  })

  ipcMain.handle('media:reveal', (_e, path: string) => shell.showItemInFolder(path))
}

export function closeAllRecordings(): void {
  for (const r of recordings.values()) closeSync(r.fd)
  recordings.clear()
}
