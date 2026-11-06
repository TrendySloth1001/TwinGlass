// Wires the agent MCP server to the app: settings toggle, setup command, activity feed.
import { BrowserWindow, clipboard, ipcMain } from 'electron'
import type { Adb } from './adb/adb'
import { DeviceController } from './agent/controller'
import { AgentServer, loadAgentSettings } from './agent/mcp-server'
import { findSessionBySerials } from './session-ipc'
import { unlockForAgent } from './unlock-ipc'

let server: AgentServer | null = null

export function registerAgentIpc(getAdb: () => Adb | null): void {
  const ctl = new DeviceController({ adb: getAdb, findSession: findSessionBySerials, unlock: unlockForAgent })
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

export async function stopAgentServer(): Promise<void> {
  await server?.stop()
}
