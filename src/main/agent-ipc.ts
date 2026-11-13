// Wires the agent MCP server to the app: settings toggle, setup command, activity feed.
import { registerTestsIpc } from './tests-ipc'
import { registerDesignIpc } from './design-ipc'
import { BrowserWindow, clipboard, ipcMain, webContents } from 'electron'
import type { Adb } from './adb/adb'
import { DeviceController, type DisplaySpec } from './agent/controller'
import { AgentServer, loadAgentSettings } from './agent/mcp-server'
import { agentServiceEnabled, bridgeCall, setAgentService } from './agent/phone-bridge'
import { findSessionBySerials } from './session-ipc'
import { unlockForAgent } from './unlock-ipc'

let server: AgentServer | null = null

// record_screen: ask a window's recorder to start / stop (it answers with the saved file).
let recordSeq = 0
const recordWaiters = new Map<number, (r: { ok: boolean; path?: string | null; error?: string }) => void>()
ipcMain.on('agent:record-result', (_e, id: number, r: { ok: boolean; path?: string | null; error?: string }) => {
  recordWaiters.get(id)?.(r)
  recordWaiters.delete(id)
})
function recordIn(webContentsId: number, on: boolean): Promise<string | null> {
  const wc = webContents.fromId(webContentsId)
  if (!wc || wc.isDestroyed()) return Promise.reject(new Error('That window is gone.'))
  const id = ++recordSeq
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      recordWaiters.delete(id)
      reject(new Error('The window did not answer.'))
    }, 15_000)
    recordWaiters.set(id, (r) => {
      clearTimeout(timer)
      if (r.ok) resolve(r.path ?? null)
      else reject(new Error(r.error ?? 'Recording failed'))
    })
    wc.send('agent:record', id, on)
  })
}

export function registerAgentIpc(
  getAdb: () => Adb | null,
  deps: { serverPath: () => string; openAgentScreen: (serial: string, kind: 'usb' | 'wifi', display: DisplaySpec) => void },
): void {
  const ctl = new DeviceController({
    adb: getAdb,
    serverPath: deps.serverPath,
    options: () => server!.options(),
    findSession: findSessionBySerials,
    openAgentScreen: deps.openAgentScreen,
    closeWindow: (id) => BrowserWindow.fromWebContents(webContents.fromId(id)!)?.close(),
    record: recordIn,
    unlock: unlockForAgent,
  })
  registerTestsIpc(ctl)
  registerDesignIpc(ctl)
  ctl.on('activity', (summary) => {
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send('agent:activity', { summary, at: Date.now() })
  })
  server = new AgentServer(ctl, loadAgentSettings())
  if (server.status().enabled) void server.start()

  // Keep every window's switch in sync with the real server state.
  const broadcastStatus = (): void => {
    const s = server!.status()
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send('agent:status', s)
  }
  ipcMain.handle('agent:status', () => server!.status())
  ipcMain.handle('agent:set-enabled', async (_e, enabled: unknown) => {
    const s = await server!.setEnabled(enabled === true)
    broadcastStatus()
    return s
  })
  ipcMain.handle('agent:set-options', (_e, o: Record<string, unknown>) => {
    const s = server!.setOptions(o ?? {})
    broadcastStatus()
    return s
  })
  /**
   * "Agents read any screen": the phone app's accessibility service. Status: is the phone app new
   * enough (has the agent receiver), and is the service switched on in the phone's settings.
   */
  ipcMain.handle('agent:a11y-status', async (_e, serial: unknown) => {
    const a = getAdb()
    if (!a || typeof serial !== 'string') return { app: false, enabled: false, connected: false }
    const ping = await bridgeCall(a, serial, 'ping').catch(() => null)
    return { app: !!ping, enabled: await agentServiceEnabled(a, serial).catch(() => false), connected: ping?.service === true }
  })
  ipcMain.handle('agent:set-port', async (_e, port: unknown) => {
    const s = await server!.setPort(Number(port))
    broadcastStatus()
    return s
  })
  ipcMain.handle('agent:reset-device-state', (_e, serial: unknown) => ctl.setDeviceState({ reset: true }, typeof serial === 'string' ? serial : undefined))
  ipcMain.handle('agent:a11y-set', async (_e, serial: unknown, on: unknown) => {
    const a = getAdb()
    if (!a || typeof serial !== 'string') throw new Error('Connect a phone first.')
    return setAgentService(a, serial, on === true)
  })
  // The token goes straight to the clipboard; it is never handed to the renderer.
  ipcMain.handle('agent:copy-setup', () => {
    clipboard.writeText(server!.setupCommand())
  })
  ipcMain.handle('agent:regenerate-token', async () => {
    server!.regenerateToken()
    clipboard.writeText(server!.setupCommand())
    return server!.status()
  })
}

/** For the phone app's "Connected to" screen: are agents on, and where do they work. */
export function agentSummary(): { enabled: boolean; running: boolean; workspace: string } | null {
  if (!server) return null
  const s = server.status()
  return { enabled: s.enabled, running: s.running, workspace: s.workspace }
}

export async function stopAgentServer(): Promise<void> {
  await server?.stop()
}
