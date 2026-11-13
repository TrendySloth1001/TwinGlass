// Test matrix and visual baselines: replay a recorded test under several conditions (light, dark,
// large text) on the agent's second screen, keep the final screen of each, and compare it with the
// baseline the user accepted. Phone-wide settings change during the run and are always put back.
import { app, BrowserWindow, ipcMain, nativeImage } from 'electron'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { DeviceController } from './agent/controller'
import { testFileName } from '@shared/tests'
import { CHANGED_PERCENT, diffPixels, MATRIX_CONDITIONS, type MatrixCell, type MatrixConditionId } from '@shared/visual-diff'
import { listTests, runTest } from './tests-ipc'

const baselineFile = (test: string, cond: string): string => join(app.getPath('userData'), 'baselines', testFileName(test), `${cond}.jpg`)
const dataUrl = (buf: Buffer): string => `data:image/jpeg;base64,${buf.toString('base64')}`

/** Percent of pixels that changed between two JPEGs (the newer one is scaled to the baseline's size). */
export function comparedPercent(baseline: Buffer, now: Buffer): number {
  const a = nativeImage.createFromBuffer(baseline)
  let b = nativeImage.createFromBuffer(now)
  const { width, height } = a.getSize()
  const sb = b.getSize()
  if (sb.width !== width || sb.height !== height) b = b.resize({ width, height, quality: 'best' })
  return diffPixels(new Uint8Array(a.toBitmap()), new Uint8Array(b.toBitmap()), width, height).percent
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export function registerMatrixIpc(ctl: DeviceController): void {
  let running = false
  const progress = (sender: Electron.WebContents, cell: MatrixCell | { condition: MatrixConditionId; status: 'running' }): void => {
    if (!sender.isDestroyed()) sender.send('matrix:progress', cell)
  }

  ipcMain.handle('matrix:run', async (e, name: unknown, device: unknown, ids: unknown): Promise<MatrixCell[]> => {
    if (typeof name !== 'string' || typeof device !== 'string' || !device) throw new Error('Choose a test and a phone.')
    const wanted = Array.isArray(ids) ? MATRIX_CONDITIONS.filter((c) => ids.includes(c.id)) : []
    if (!wanted.length) throw new Error('Pick at least one condition.')
    const t = (await listTests()).find((x) => x.name === name)
    if (!t) throw new Error(`No test named “${name}”.`)
    if (running) throw new Error('A matrix is already running.')
    running = true
    const cells: MatrixCell[] = []
    try {
      for (const c of wanted) {
        progress(e.sender, { condition: c.id, status: 'running' })
        // Each condition starts from the phone's own settings; animations off keeps screens steady.
        await ctl.setDeviceState({ reset: true }, device, true)
        await ctl.setDeviceState({ ...c.state, animations: false }, device, true)
        await sleep(1200) // the theme and font change reach running apps
        const r = await runTest(ctl, t, device, undefined, 'agent')
        let cell: MatrixCell
        if (!r.ok) {
          cell = { condition: c.id, label: c.label, status: 'failed', steps: r.results.length, message: r.results.at(-1)?.message, screenshot: r.screenshot }
        } else {
          await sleep(500)
          const shot = await ctl.screenshot(device, 'agent')
          const now = Buffer.from(shot.data, 'base64')
          const file = baselineFile(t.name, c.id)
          if (existsSync(file)) {
            const base = await readFile(file)
            const percent = comparedPercent(base, now)
            cell = { condition: c.id, label: c.label, status: percent > CHANGED_PERCENT ? 'changed' : 'same', steps: r.results.length, screenshot: dataUrl(now), baseline: dataUrl(base), diffPercent: percent }
          } else {
            cell = { condition: c.id, label: c.label, status: 'new', steps: r.results.length, screenshot: dataUrl(now) }
          }
        }
        cells.push(cell)
        progress(e.sender, cell)
      }
      return cells
    } finally {
      await ctl.setDeviceState({ reset: true }, device, true).catch(() => {})
      running = false
    }
  })

  /** Keep this screen as the baseline for the test under that condition. */
  ipcMain.handle('matrix:accept', async (_e, name: unknown, cond: unknown, image: unknown) => {
    if (typeof name !== 'string' || !MATRIX_CONDITIONS.some((c) => c.id === cond) || typeof image !== 'string') throw new Error('Bad baseline.')
    const m = /^data:image\/jpeg;base64,(.+)$/.exec(image)
    if (!m) throw new Error('Bad image.')
    const file = baselineFile(name, cond as string)
    await mkdir(join(file, '..'), { recursive: true })
    await writeFile(file, Buffer.from(m[1]!, 'base64'))
    for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('matrix:baselines-changed', name)
  })
}
