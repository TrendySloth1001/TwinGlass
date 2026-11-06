// Device discovery and wireless setup IPC: live list, pairing (code / QR), connect, tcpip.
import QRCode from 'qrcode'
import { BrowserWindow, ipcMain } from 'electron'
import type { Adb, DeviceList, DeviceTracker, QrPairingSession } from './adb/adb'
import { isPairingCode, normalizeHostPort } from './adb/wireless'

let tracker: DeviceTracker | null = null
let latest: DeviceList | null = null
let qr: QrPairingSession | null = null

const broadcast = (channel: string, payload: unknown): void => {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send(channel, payload)
}

const subscribers = new Set<(list: DeviceList) => void>()

/** Starts live tracking (once) and returns the current list. Shared by the renderer and the tray. */
export async function trackDevices(adb: Adb): Promise<DeviceList> {
  if (!tracker) {
    tracker = adb.track()
    tracker.on('change', (list) => {
      latest = list
      broadcast('devices:changed', list)
      for (const s of subscribers) s(list)
    })
    tracker.on('error', (e) => console.error('[track-devices]', e))
  }
  return latest ?? (latest = await adb.devices())
}

/** Device list changes (main-process consumers, e.g. the menu bar icon). */
export function onDevicesChanged(cb: (list: DeviceList) => void): () => void {
  subscribers.add(cb)
  return () => subscribers.delete(cb)
}

export function registerDevicesIpc(getAdb: () => Adb | null): void {
  const need = (): Adb => {
    const adb = getAdb()
    if (!adb) throw new Error('adb not found. Install it with: brew install android-platform-tools')
    return adb
  }

  ipcMain.handle('adb:status', async () => {
    const adb = getAdb()
    return adb ? adb.status() : { adbPath: null }
  })

  ipcMain.handle('devices:list', async () => trackDevices(need()))

  ipcMain.handle('wireless:pair', async (_e, hostPort: string, code: string) => {
    const hp = normalizeHostPort(hostPort)
    if (!hp) return { ok: false, message: 'Enter the IP address and port shown under "Pair with pairing code", e.g. 192.168.0.13:37851' }
    if (!isPairingCode(code)) return { ok: false, message: 'The pairing code is the 6-digit number shown on the phone.' }
    return need().pair(hp, code.trim())
  })

  ipcMain.handle('wireless:connect', async (_e, hostPort: string) => {
    const hp = normalizeHostPort(hostPort, 5555)
    if (!hp) return { ok: false, message: 'Enter an address like 192.168.0.13:41233 (the port is shown on the Wireless debugging screen).' }
    return need().connect(hp)
  })

  ipcMain.handle('wireless:disconnect', async (_e, serial: string) => need().disconnect(serial))

  // Replaces an adb server started by another tool (older version) with this app's adb.
  // Paired Wi-Fi phones reconnect via mDNS; live mirrors reconnect automatically.
  ipcMain.handle('adb:restart-server', async () => {
    const adb = need()
    await adb.runLoose(['kill-server'], undefined, 10000)
    await adb.runLoose(['start-server'], undefined, 20000)
    tracker?.stop()
    tracker = null
    latest = null
    return adb.status()
  })
  ipcMain.handle('wireless:tcpip', async (_e, serial: string) => need().enableTcpip(serial))

  ipcMain.handle('wireless:qr:start', async (e) => {
    qr?.cancel()
    const session = need().qrPairing()
    qr = session
    const sender = e.sender
    session.on('state', (s) => {
      if (!sender.isDestroyed()) sender.send('wireless:qr:state', s)
    })
    void session.run().finally(() => {
      if (qr === session) qr = null
    })
    const svg = await QRCode.toString(session.qr.payload, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' })
    return { svg, name: session.qr.name }
  })

  ipcMain.handle('wireless:qr:cancel', () => {
    qr?.cancel()
    qr = null
  })
}

export function stopDeviceTracking(): void {
  tracker?.stop()
  tracker = null
  qr?.cancel()
}
