import { join } from 'node:path'
import { app, BrowserWindow, ipcMain } from 'electron'
import { Adb, findAdb } from './adb/adb'
import { registerSessionIpc, stopAllSessions } from './session-ipc'

export function serverPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'scrcpy-server-v5.0.1')
    : join(app.getAppPath(), 'resources', 'scrcpy-server-v5.0.1')
}

let adb: Adb | null = null

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1100,
    height: 900,
    minWidth: 640,
    minHeight: 480,
    title: 'Mob Mirror',
    backgroundColor: '#111',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  })
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
}

ipcMain.handle('adb:status', () => ({ adbPath: adb?.path ?? null }))
ipcMain.handle('devices:list', async () => {
  if (!adb) throw new Error('adb not found. Install it with: brew install android-platform-tools')
  return adb.devices()
})
registerSessionIpc(() => adb, serverPath)

void app.whenReady().then(() => {
  const path = findAdb()
  adb = path ? new Adb(path) : null
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', stopAllSessions)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
