import { join } from 'node:path'
import { app, BrowserWindow, ipcMain, nativeTheme } from 'electron'
import { mirrorHash, registerTabs } from './tabs'
import { Adb, findAdb } from './adb/adb'
import { registerDevicesIpc, stopDeviceTracking } from './devices-ipc'
import { closeAllRecordings, registerMediaIpc } from './media-ipc'
import { installMenu } from './menu'
import { registerWindowLayoutIpc } from './window-layout'
import { getSession, mirroredSerials, registerSessionIpc, sessionSummary, stopAllSessions } from './session-ipc'
import { registerUnlockIpc } from './unlock-ipc'
import { registerPhoneAppsIpc } from './phone-apps'
import { registerClipboardHistoryIpc, startClipboardHistory } from './clipboard-history'
import { setTrayVisible, startTrayUpdates } from './tray'
import { registerUpdateIpc } from './update-check'
import { registerAboutIpc } from './about'
import { startCompanionLink, stopCompanionLink } from './companion-link'
import { agentSummary, registerAgentIpc, stopAgentServer } from './agent-ipc'
import { closeApkDownload, directServer, openApkDownload } from './direct/server'
import { bundledPhoneApp } from './bundled-phone-app'

export function serverPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'scrcpy-server-v5.0.1')
    : join(app.getAppPath(), 'resources', 'scrcpy-server-v5.0.1')
}

let adb: Adb | null = null

/**
 * adb is looked up lazily and again whenever it was missing, so installing platform-tools while the
 * app is open works without restarting the app.
 */
function getAdb(): Adb | null {
  if (!adb) {
    const path = findAdb()
    if (path) adb = new Adb(path)
  }
  return adb
}

/** @param autoConnect transport serial to start mirroring as soon as the window loads */
function createWindow(autoConnect?: {
  serial: string
  kind: string
  second?: boolean
  app?: string
  agent?: boolean
  /** Second screen size (agent screen setting). */
  display?: { width: number; height: number; dpi: number }
  /** Start in the compact, phone-shaped view (a tab popped out with "mobile view"). */
  compact?: boolean
}): BrowserWindow {
  const win = new BrowserWindow({
    // The agent screen opens without taking focus from what the user is doing.
    show: !autoConnect?.agent,
    width: 1180,
    height: 900,
    // The layout adapts down to this (toolbar overflow menu, floating sidebar, compact status bar).
    minWidth: 480,
    minHeight: 420,
    title: 'Twinglass',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 13, y: 11 },
    // Transparent so the compact view can float the control rail beside the phone with a
    // see-through gap. The full view paints its own opaque background.
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      // A mirror must keep decoding/drawing at full rate when the window is behind others or
      // unfocused; Chromium otherwise throttles timers/rendering of hidden pages (verified: the
      // page reported visibilityState "hidden" while occluded).
      backgroundThrottling: false,
    },
  })
  const hash = autoConnect ? mirrorHash(autoConnect) + (autoConnect.compact ? '&view=compact' : '') : ''
  if (autoConnect?.agent) win.once('ready-to-show', () => win.showInactive())
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}#${hash}`)
  else void win.loadFile(join(__dirname, '../renderer/index.html'), { hash })
  return win
}

/**
 * "Wi-Fi, no setup" phones (the Twinglass app without developer mode). A phone that offers its
 * screen ("Mirror to Mac" on the phone) gets a mirror window here, unless one already shows it.
 */
function startDirect(): void {
  directServer.start()
  const broadcast = (): void => {
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send('direct:changed', directServer.list())
  }
  directServer.on('changed', broadcast)
  directServer.on('offer', (serial) => {
    if (mirroredSerials().has(serial)) return
    const w = createWindow({ serial, kind: 'wifi' })
    w.once('ready-to-show', () => w.focus())
  })
}
ipcMain.handle('direct:list', () => directServer.list())
ipcMain.handle('direct:pairing', (_e, open: unknown) => (open === false ? (directServer.closePairing(), null) : directServer.openPairing()))
ipcMain.handle('direct:pairing-state', () => directServer.pairingState())
// The phone app's APK for "Get the app" (release build in development, bundled when packaged).
ipcMain.handle('direct:apk', async (_e, open: unknown) => {
  if (open === false) return closeApkDownload(), null
  const b = bundledPhoneApp()
  return b ? openApkDownload(b.path) : null
})
ipcMain.handle('direct:forget', (_e, id: unknown) => (typeof id === 'string' ? { told: directServer.forget(id) } : { told: false }))

ipcMain.handle('window:open-device', (_e, serial: string, kind: string, opts?: { second?: boolean; app?: string }) => {
  const app = typeof opts?.app === 'string' && /^[\w.]+$/.test(opts.app) ? opts.app : undefined
  createWindow({ serial, kind, second: opts?.second === true, app })
})

// Phones opened as editor tabs in a window; "mobile view" pops one out as its own compact window.
registerTabs((t) => void createWindow({ ...t, compact: t.compact }))
registerDevicesIpc(getAdb)
registerSessionIpc(getAdb, serverPath)
registerUnlockIpc(getAdb, getSession)
void app.whenReady().then(() =>
  registerAgentIpc(getAdb, {
    serverPath,
    // The agents' own second screen: a normal Twinglass window, so the user can watch it.
    openAgentScreen: (serial, kind, display) => void createWindow({ serial, kind, second: true, agent: true, display }),
  }),
) // needs app paths (userData)
registerMediaIpc()
registerWindowLayoutIpc()
registerPhoneAppsIpc(getAdb, serverPath, getSession)
registerClipboardHistoryIpc()
void app.whenReady().then(registerUpdateIpc)
registerAboutIpc()

/** Menu bar icon actions: mirror in an idle window (or a new one), show the app. */
const trayDeps = {
  getAdb,
  mirror: (t: { serial: string; kind: 'usb' | 'wifi' }) => {
    const idle = BrowserWindow.getAllWindows().find((w) => !getSession(w.webContents.id))
    if (idle) {
      idle.show()
      idle.focus()
      idle.webContents.send('ui:connect', t)
    } else createWindow(t)
  },
  showApp: () => {
    const w = BrowserWindow.getAllWindows()[0] ?? createWindow()
    w.show()
    w.focus()
  },
}
ipcMain.handle('app:set-tray', (_e, on: unknown) => setTrayVisible(on === true, trayDeps))
ipcMain.handle('app:login-item', (_e, on: unknown) => {
  if (typeof on === 'boolean') app.setLoginItemSettings({ openAtLogin: on })
  return app.getLoginItemSettings().openAtLogin
})
// Appearance from the app's settings (System / Light / Dark): native parts follow it too.
ipcMain.handle('app:theme', (_e, t: unknown) => {
  nativeTheme.themeSource = t === 'light' || t === 'dark' ? t : 'system'
})

/**
 * Development only: MOB_UI_PREVIEW=1 runs the UI against its own profile (MOB_USER_DATA) without the
 * Wi-Fi server or the phone-app link, so screenshots of a dev build can't reach a phone that another
 * Twinglass is using. Ignored in packaged builds.
 */
const uiPreview = !app.isPackaged && process.env.MOB_UI_PREVIEW === '1'
if (uiPreview && process.env.MOB_USER_DATA) app.setPath('userData', process.env.MOB_USER_DATA)

void app.whenReady().then(() => {
  // Packaged builds get build/icon.icns from electron-builder; in development show it in the Dock too.
  if (process.platform === 'darwin' && !app.isPackaged) app.dock?.setIcon(join(app.getAppPath(), 'build/icon.png'))
  getAdb()
  installMenu()
  createWindow()
  startClipboardHistory()
  startTrayUpdates(trayDeps)
  if (!uiPreview) {
    startCompanionLink(getAdb, { sessions: sessionSummary, agents: agentSummary })
    startDirect()
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// A bug in a background task must not freeze the app behind Electron's modal error box:
// log it and tell the windows (shown as an in-app notification).
const reportMainError = (kind: string) => (err: unknown) => {
  const message = err instanceof Error ? `${err.message}` : String(err)
  console.error(`[main] ${kind}:`, err)
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('app:error', message)
}
process.on('uncaughtException', reportMainError('uncaught exception'))
process.on('unhandledRejection', reportMainError('unhandled rejection'))

app.on('before-quit', () => {
  directServer.stop()
  closeApkDownload()
  stopCompanionLink()
  stopAllSessions()
  stopDeviceTracking()
  closeAllRecordings()
  void stopAgentServer()
})
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
