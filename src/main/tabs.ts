// Editor tabs in a window: each mirrored phone (or second screen) opened as a tab is its own page
// (a WebContentsView) laid over the window's editor area. A tab is therefore exactly like a mirror
// window to everything else (one session per webContents), so a window can hold as many as the
// user opens. Only the selected tab's view is shown; "mobile view" pops a tab out into its own
// compact window.
import { BrowserWindow, ipcMain, WebContentsView, type Rectangle, type WebContents } from 'electron'
import { join } from 'node:path'

export interface TabTarget {
  serial: string
  kind: string
  second?: boolean
  app?: string
}

export interface TabInfo extends TabTarget {
  id: string
  /** Shown on the tab: the phone's name once its page knows it. */
  title: string
}

interface Tab {
  info: TabInfo
  view: WebContentsView
}

interface Host {
  win: BrowserWindow
  tabs: Map<string, Tab>
  /** The selected phone tab, or null when Welcome / Settings is in front. */
  active: string | null
  /** The editor area in the window, from its renderer. */
  bounds: Rectangle | null
  /** A menu, dialog or popover of the window is open over the editor area: views would hide it. */
  covered: boolean
}

const hosts = new Map<number, Host>()
let nextId = 1

/** Hash for a page that mirrors [t] (shared with windows; see createWindow). */
export function mirrorHash(t: TabTarget & { agent?: boolean; display?: { width: number; height: number; dpi: number } }): string {
  return (
    `connect=${encodeURIComponent(t.serial)}&kind=${t.kind}` +
    (t.second ? `&screen=second${t.app ? `&app=${encodeURIComponent(t.app)}` : ''}` : '') +
    (t.agent ? '&agent=1' : '') +
    (t.display ? `&size=${t.display.width}x${t.display.height}/${t.display.dpi}` : '')
  )
}

function host(win: BrowserWindow): Host {
  let h = hosts.get(win.id)
  if (!h) {
    h = { win, tabs: new Map(), active: null, bounds: null, covered: false }
    hosts.set(win.id, h)
    const id = win.id
    win.on('closed', () => {
      const gone = hosts.get(id)
      hosts.delete(id)
      // Views outlive their window unless closed: stop their sessions now.
      for (const t of gone?.tabs.values() ?? []) if (!t.view.webContents.isDestroyed()) t.view.webContents.close()
    })
  }
  return h
}

function layout(h: Host): void {
  for (const [id, t] of h.tabs) {
    const show = id === h.active && !h.covered && h.bounds !== null
    t.view.setVisible(show)
    if (show && h.bounds) t.view.setBounds(h.bounds)
  }
}

function publish(h: Host): void {
  if (h.win.isDestroyed()) return
  h.win.webContents.send('tabs:changed', { tabs: [...h.tabs.values()].map((t) => t.info), active: h.active })
}

function find(wc: WebContents): { h: Host; t: Tab } | null {
  for (const h of hosts.values()) for (const t of h.tabs.values()) if (t.view.webContents === wc) return { h, t }
  return null
}

/** The window showing a tab's page (null for a window's own page or unknown contents). */
export function hostWindowOf(wc: WebContents): BrowserWindow | null {
  return find(wc)?.h.win ?? null
}

/** Where a Device-menu shortcut should go: the selected tab of the focused window, else the window. */
export function deviceTarget(win: BrowserWindow | null): WebContents | null {
  if (!win) return null
  const h = hosts.get(win.id)
  const t = h?.active ? h.tabs.get(h.active) : undefined
  return t && !t.view.webContents.isDestroyed() ? t.view.webContents : win.webContents
}

/** Every serial shown in a tab (for "is this phone already mirrored?"). */
export function tabSerials(): Set<string> {
  const s = new Set<string>()
  for (const h of hosts.values()) for (const t of h.tabs.values()) if (!t.info.second) s.add(t.info.serial)
  return s
}

function close(h: Host, id: string): void {
  const t = h.tabs.get(id)
  if (!t) return
  h.tabs.delete(id)
  if (!h.win.isDestroyed()) h.win.contentView.removeChildView(t.view)
  if (!t.view.webContents.isDestroyed()) t.view.webContents.close()
  if (h.active === id) h.active = [...h.tabs.keys()].at(-1) ?? null
  layout(h)
  publish(h)
}

export function registerTabs(openWindow: (t: TabTarget & { compact?: boolean }) => void): void {
  ipcMain.handle('tabs:open', (e, target: TabTarget) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win || typeof target?.serial !== 'string' || (target.kind !== 'usb' && target.kind !== 'wifi')) return null
    const h = host(win)
    // The same phone (not a second screen) already has a tab: just show it.
    if (!target.second) {
      for (const t of h.tabs.values())
        if (!t.info.second && t.info.serial === target.serial) {
          h.active = t.info.id
          layout(h)
          publish(h)
          return t.info.id
        }
    }
    const view = new WebContentsView({
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    })
    view.setBackgroundColor('#00000000')
    const id = `t${nextId++}`
    const info: TabInfo = {
      id,
      serial: target.serial,
      kind: target.kind,
      ...(target.second ? { second: true } : {}),
      ...(target.app && /^[\w.]+$/.test(target.app) ? { app: target.app } : {}),
      title: target.second ? 'Second screen' : 'Phone',
    }
    const hash = `${mirrorHash(info)}&embed=1`
    if (process.env.ELECTRON_RENDERER_URL) void view.webContents.loadURL(`${process.env.ELECTRON_RENDERER_URL}#${hash}`)
    else void view.webContents.loadFile(join(__dirname, '../renderer/index.html'), { hash })
    // The page crashed or closed itself: drop its tab.
    view.webContents.once('destroyed', () => {
      if (h.tabs.has(id)) close(h, id)
    })
    win.contentView.addChildView(view)
    h.tabs.set(id, { info, view })
    h.active = id
    layout(h)
    publish(h)
    view.webContents.focus()
    return id
  })

  ipcMain.handle('tabs:list', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const h = win ? hosts.get(win.id) : undefined
    return { tabs: h ? [...h.tabs.values()].map((t) => t.info) : [], active: h?.active ?? null }
  })

  ipcMain.on('tabs:select', (e, id: unknown) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const h = win ? hosts.get(win.id) : undefined
    if (!h) return
    h.active = typeof id === 'string' && h.tabs.has(id) ? id : null
    layout(h)
    publish(h)
    if (h.active) h.tabs.get(h.active)?.view.webContents.focus()
  })

  ipcMain.on('tabs:close', (e, id: unknown) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const h = win ? hosts.get(win.id) : undefined
    if (h && typeof id === 'string') close(h, id)
  })

  ipcMain.on('tabs:bounds', (e, r: unknown) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return
    const b = r as Rectangle | null
    const h = host(win)
    h.bounds =
      b && [b.x, b.y, b.width, b.height].every((n) => Number.isFinite(n))
        ? { x: Math.round(b.x), y: Math.round(b.y), width: Math.max(0, Math.round(b.width)), height: Math.max(0, Math.round(b.height)) }
        : null
    layout(h)
  })

  ipcMain.on('tabs:cover', (e, covered: unknown) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const h = win ? hosts.get(win.id) : undefined
    if (!h || h.covered === (covered === true)) return
    h.covered = covered === true
    layout(h)
  })

  /** The window asks its selected tab to open something of its own (search, clipboard). */
  ipcMain.on('tabs:command', (e, cmd: unknown) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const h = win ? hosts.get(win.id) : undefined
    const t = h?.active ? h.tabs.get(h.active) : undefined
    if (!t || (cmd !== 'open-palette' && cmd !== 'open-clipboard' && cmd !== 'open-second-screen')) return
    t.view.webContents.focus()
    t.view.webContents.send('ui:command', cmd)
  })

  // From a tab's own page.
  ipcMain.on('tabs:title', (e, title: unknown) => {
    const f = find(e.sender)
    if (!f || typeof title !== 'string' || !title || f.t.info.title === title) return
    f.t.info.title = title.slice(0, 60)
    publish(f.h)
  })
  ipcMain.on('tabs:self-close', (e) => {
    const f = find(e.sender)
    if (f) close(f.h, f.t.info.id)
  })
  /** "Mobile view": the tab leaves the window as its own phone-shaped window. */
  ipcMain.on('tabs:popout', (e) => {
    const f = find(e.sender)
    if (!f) return
    const { serial, kind, second, app } = f.t.info
    close(f.h, f.t.info.id)
    // Give the closed tab's session a moment to let go of the phone before the window connects.
    setTimeout(() => openWindow({ serial, kind, second, app, compact: true }), 400)
  })
}
