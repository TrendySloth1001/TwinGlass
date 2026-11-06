// Window shapes for the two views:
//  - full:    the manager layout (sidebar, toolbar, status bar); free resizing.
//  - compact: a phone-shaped mirror window: thin title strip with the traffic lights, the mirror
//             edge to edge and a control rail on the right. The aspect ratio is locked to the
//             phone's (follows rotation), so resizing never letterboxes.
import { BrowserWindow, ipcMain, screen, type Rectangle } from 'electron'

/** Must match the renderer's compact chrome (h-7 title strip, w-14 rail). */
export const COMPACT_TITLE = 28
export const COMPACT_RAIL = 56

const fullBounds = new Map<number, Rectangle>()
const mode = new Map<number, 'full' | 'compact'>()

function applyCompact(win: BrowserWindow, aspect: number): void {
  if (mode.get(win.id) !== 'compact') fullBounds.set(win.id, win.getBounds())
  mode.set(win.id, 'compact')
  const work = screen.getDisplayMatching(win.getBounds()).workArea
  const curH = win.getContentSize()[1] ?? 800
  // Keep the current height (within the screen); width follows the phone's aspect.
  let videoH = Math.min(Math.max(curH - COMPACT_TITLE, 480), work.height - COMPACT_TITLE - 24)
  let videoW = Math.round(videoH * aspect)
  const maxW = work.width - COMPACT_RAIL - 24
  if (videoW > maxW) {
    videoW = maxW
    videoH = Math.round(videoW / aspect)
  }
  win.setAspectRatio(0)
  win.setMinimumSize(Math.round(220 * Math.min(aspect, 1)) + COMPACT_RAIL, 320)
  win.setContentSize(videoW + COMPACT_RAIL, videoH + COMPACT_TITLE, true)
  win.setAspectRatio(aspect, { width: COMPACT_RAIL, height: COMPACT_TITLE })
  win.setWindowButtonPosition({ x: 10, y: 7 })
}

function applyFull(win: BrowserWindow): void {
  if (mode.get(win.id) === 'full') return
  mode.set(win.id, 'full')
  win.setAspectRatio(0)
  win.setMinimumSize(480, 420)
  const b = fullBounds.get(win.id)
  if (b) win.setBounds(b, true)
  win.setWindowButtonPosition({ x: 16, y: 16 })
}

export function registerWindowLayoutIpc(): void {
  ipcMain.handle('window:layout', (e, layout: unknown, aspect: unknown) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win || win.isFullScreen()) return
    if (layout === 'compact' && typeof aspect === 'number' && aspect > 0.2 && aspect < 5) applyCompact(win, aspect)
    else applyFull(win)
  })
}
