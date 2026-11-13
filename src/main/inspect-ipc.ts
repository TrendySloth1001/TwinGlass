// Inspect mode: the mirrored screen's full layout (every view's bounds in display pixels and dp,
// insets, gaps, text sizes, sampled colours), for the hover overlay on the mirror. Read-only.
import { ipcMain } from 'electron'
import type { DeviceController } from './agent/controller'

export function registerInspectIpc(ctl: DeviceController): void {
  ipcMain.handle('inspect:map', async (_e, device: unknown) => {
    if (typeof device !== 'string' || !device) throw new Error('Mirror a phone first.')
    const { map } = await ctl.screenMap({ detail: 'full', image: false, colors: true, maxNodes: 1500 }, device, 'phone')
    return map
  })
}
