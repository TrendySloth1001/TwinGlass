import { join } from 'node:path'
import { app, BrowserWindow, ipcMain } from 'electron'
import { Adb, findAdb } from './adb/adb'
import { registerDevicesIpc, stopDeviceTracking } from './devices-ipc'
import { closeAllRecordings, registerMediaIpc } from './media-ipc'
import { installMenu } from './menu'
import { getSession, registerSessionIpc, stopAllSessions } from './session-ipc'
import { registerUnlockIpc } from './unlock-ipc'

export function serverPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'scrcpy-server-v5.0.1')
    : join(app.getAppPath(), 'resources', 'scrcpy-server-v5.0.1')
}

let adb: Adb | null = null

/** @param autoConnect transport serial to start mirroring as soon as the window loads */
function createWindow(autoConnect?: { serial: string; kind: string }): BrowserWindow {
  const win = new BrowserWindow({
    width: 1180,
    height: 900,
    minWidth: 720,
    minHeight: 520,
    title: 'Mob Mirror',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#1c1c1c',
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

registerDevicesIpc(() => adb)
registerSessionIpc(() => adb, serverPath)
registerUnlockIpc(() => adb, getSession)
registerMediaIpc()

void app.whenReady().then(() => {
  const path = findAdb()
  adb = path ? new Adb(path) : null
  installMenu()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  stopAllSessions()
  stopDeviceTracking()
  closeAllRecordings()
})
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
