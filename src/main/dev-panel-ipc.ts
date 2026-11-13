// The developer panel (bottom of the window): the phone's log, crashes and performance numbers for
// the app in front (or a package the user pinned). Polled by the panel while it's open. Read-only.
import { ipcMain } from 'electron'
import type { DeviceController } from './agent/controller'

const PKG = /^[A-Za-z][\w]*(\.[\w]+)+$/

export function registerDevPanelIpc(ctl: DeviceController): void {
  const dev = (v: unknown): string => {
    if (typeof v !== 'string' || !v) throw new Error('Connect a phone first.')
    return v
  }
  const pkg = (v: unknown): string | undefined => (typeof v === 'string' && PKG.test(v) ? v : undefined)
  ipcMain.handle('devpanel:front', async (_e, device: unknown) => {
    const info = await ctl.info(dev(device), 'phone')
    return typeof info.foregroundApp === 'string' ? info.foregroundApp : null
  })
  ipcMain.handle('devpanel:logcat', (_e, device: unknown, p: unknown, level: unknown) =>
    ctl.logcat({ quiet: true, pkg: pkg(p), lines: 400, level: ['V', 'D', 'I', 'W', 'E'].includes(level as string) ? (level as 'V') : undefined }, dev(device)),
  )
  ipcMain.handle('devpanel:crashes', (_e, device: unknown, p: unknown) => ctl.crashes(pkg(p), 400, dev(device), true))
  ipcMain.handle('devpanel:perf', (_e, device: unknown, p: unknown) => {
    const name = pkg(p)
    return name ? ctl.perfStats(name, dev(device)) : null
  })
}
