import { join } from 'node:path'
import { app, BrowserWindow, ipcMain, nativeTheme } from 'electron'
import { Adb, findAdb } from './adb/adb'
import { registerDevicesIpc, stopDeviceTracking } from './devices-ipc'
import { closeAllRecordings, registerMediaIpc } from './media-ipc'
import { installMenu } from './menu'
import { registerWindowLayoutIpc } from './window-layout'
import { getSession, registerSessionIpc, stopAllSessions } from './session-ipc'
import { registerUnlockIpc } from './unlock-ipc'
import { registerPhoneAppsIpc } from './phone-apps'
import { registerClipboardHistoryIpc, startClipboardHistory } from './clipboard-history'
import { setTrayVisible, startTrayUpdates } from './tray'
import { registerMacScreenIpc, stopMacScreen } from './mac-screen'
import { registerUpdateIpc } from './update-check'
import { startCompanionLink, stopCompanionLink } from './companion-link'
import { trackDevices } from './devices-ipc'
import { registerAgentIpc, stopAgentServer } from './agent-ipc'

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
function createWindow(autoConnect?: { serial: string; kind: string }): BrowserWindow {
  const win = new BrowserWindow({
    width: 1180,
    height: 900,
    // The layout adapts down to this (toolbar overflow menu, floating sidebar, compact status bar).
    minWidth: 480,
    minHeight: 420,
    title: 'Mob Mirror',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
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
  const hash = autoConnect ? `connect=${encodeURIComponent(autoConnect.serial)}&kind=${autoConnect.kind}` : ''
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}#${hash}`)
  else void win.loadFile(join(__dirname, '../renderer/index.html'), { hash })
  return win
}

ipcMain.handle('window:open-device', (_e, serial: string, kind: string) => {
  createWindow({ serial, kind })
})

registerDevicesIpc(getAdb)
registerSessionIpc(getAdb, serverPath)
registerUnlockIpc(getAdb, getSession)
void app.whenReady().then(() => registerAgentIpc(getAdb)) // needs app paths (userData)
registerMediaIpc()
registerWindowLayoutIpc()
registerPhoneAppsIpc(getAdb, serverPath, getSession)
registerClipboardHistoryIpc()
void app.whenReady().then(registerUpdateIpc)
// Mac screen on the phone: the window's mirrored phone, else the first connected one.
// Prefers the phone's USB link (transports are ranked USB first): lowest latency.
registerMacScreenIpc(getAdb, async (wcId) => {
  const s = getSession(wcId)
  const adb = getAdb()
  const list = adb ? await trackDevices(adb).catch(() => null) : null
  const dev = s ? list?.devices.find((d) => d.transports.some((t) => t.serial === s.serial)) : list?.devices[0]
  return dev?.transports[0]?.serial ?? s?.serial ?? null
})

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

void app.whenReady().then(() => {
  getAdb()
  installMenu()
  createWindow()
  startClipboardHistory()
  startTrayUpdates(trayDeps)
  startCompanionLink(getAdb)
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
  stopCompanionLink()
  stopMacScreen(getAdb())
  stopAllSessions()
  stopDeviceTracking()
  closeAllRecordings()
  void stopAgentServer()
})
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
