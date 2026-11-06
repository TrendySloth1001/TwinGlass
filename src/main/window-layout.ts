// Window shapes for the two views:
//  - full:    the manager layout (sidebar, toolbar, status bar); free resizing.
//  - compact: a phone-shaped mirror window: thin title strip with the traffic lights, the mirror
//             edge to edge and a control rail on the right. The aspect ratio is locked to the
//             phone's (follows rotation), so resizing never letterboxes.
import { BrowserWindow, ipcMain, screen, type Rectangle } from 'electron'

/** Must match the renderer's compact chrome (h-7 title strip; w-12 rail + gap-2). */
export const COMPACT_TITLE = 28
export const COMPACT_RAIL = 56

const fullBounds = new Map<number, Rectangle>()
const mode = new Map<number, 'full' | 'compact'>()
/** Last compact content height per window and orientation, so rotating back restores the size. */
const compactHeight = new Map<string, number>()
const lastAspect = new Map<number, number>()
const orient = (aspect: number): string => (aspect < 1 ? 'portrait' : 'landscape')

function applyCompact(win: BrowserWindow, aspect: number, extra = { width: 0, height: 0 }): void {
  // Chrome around the video: title strip + optional nav bar / phone frame, rail + frame sides.
  const TITLE = COMPACT_TITLE + extra.height
  const RAIL = COMPACT_RAIL + extra.width
  const wasCompact = mode.get(win.id) === 'compact'
  if (!wasCompact) fullBounds.set(win.id, win.getBounds())
  mode.set(win.id, 'compact')
  const prev = lastAspect.get(win.id)
  // Remember the size the user had in the orientation we are leaving.
  if (wasCompact && prev) compactHeight.set(`${win.id}:${orient(prev)}`, win.getContentSize()[1] ?? 800)
  lastAspect.set(win.id, aspect)
  const work = screen.getDisplayMatching(win.getBounds()).workArea
  const curH = compactHeight.get(`${win.id}:${orient(aspect)}`) ?? win.getContentSize()[1] ?? 800
  // Keep the current height (within the screen); width follows the phone's aspect.
  let videoH = Math.min(Math.max(curH - TITLE, aspect < 1 ? 480 : 240), work.height - TITLE - 24)
  let videoW = Math.round(videoH * aspect)
  const maxW = work.width - RAIL - 24
  if (videoW > maxW) {
    videoW = maxW
    videoH = Math.round(videoW / aspect)
  }
  win.setAspectRatio(0)
  win.setMinimumSize(Math.round(220 * Math.min(aspect, 1)) + RAIL, 320)
  win.setContentSize(videoW + RAIL, videoH + TITLE, true)
  win.setAspectRatio(aspect, { width: RAIL, height: TITLE })
  win.setWindowButtonPosition({ x: 10, y: 7 })
  refreshShadow(win)
}

/** A transparent window's shadow follows its painted pixels: recompute after the shape changes. */
function refreshShadow(win: BrowserWindow): void {
  setTimeout(() => {
    if (!win.isDestroyed()) win.invalidateShadow()
  }, 150)
}

function applyFull(win: BrowserWindow): void {
  if (mode.get(win.id) === 'full') return
  mode.set(win.id, 'full')
  win.setAspectRatio(0)
  win.setMinimumSize(480, 420)
  const b = fullBounds.get(win.id)
  if (b) win.setBounds(b, true)
  win.setWindowButtonPosition({ x: 16, y: 16 })
  refreshShadow(win)
}

export function registerWindowLayoutIpc(): void {
  ipcMain.handle('window:layout', (e, layout: unknown, aspect: unknown, extra: unknown) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win || win.isFullScreen()) return
    const px = (v: unknown): number => (typeof v === 'number' && v >= 0 && v <= 200 ? Math.round(v) : 0)
    const ex = (extra ?? {}) as { width?: unknown; height?: unknown }
    if (layout === 'compact' && typeof aspect === 'number' && aspect > 0.2 && aspect < 5)
      applyCompact(win, aspect, { width: px(ex.width), height: px(ex.height) })
    else applyFull(win)
  })
  ipcMain.handle('window:always-on-top', (e, on: unknown) => {
    BrowserWindow.fromWebContents(e.sender)?.setAlwaysOnTop(on === true, 'floating')
  })
}
