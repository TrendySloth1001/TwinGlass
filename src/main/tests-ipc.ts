// Recorded tests: storage (one JSON file per test in userData/tests), the recorder's helpers (read the
// screen's elements before a tap, name the element a tap hit) and the runner, which replays steps on
// the phone's own screen through the same controller the agent tools use.
import { app, BrowserWindow, ipcMain } from 'electron'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { isTestStep, testFileName, type NormPoint, type SavedTest, type StepResult, type TestRunResult, type TestStep } from '@shared/tests'
import type { DeviceController, ScreenChoice } from './agent/controller'
import type { Size } from './agent/geometry'
import { describeCheck, describeTap } from './agent/recording'
import type { UiNode } from './agent/ui-tree'

const dir = (): string => join(app.getPath('userData'), 'tests')
const fileOf = (name: string): string => join(dir(), `${testFileName(name)}.json`)

export async function listTests(): Promise<SavedTest[]> {
  await mkdir(dir(), { recursive: true })
  const out: SavedTest[] = []
  for (const f of await readdir(dir())) {
    if (!f.endsWith('.json')) continue
    try {
      const t = JSON.parse(await readFile(join(dir(), f), 'utf8')) as SavedTest
      const steps = Array.isArray(t.steps) ? t.steps.filter(isTestStep) : []
      out.push({ name: typeof t.name === 'string' ? t.name : f.replace(/\.json$/, ''), createdAt: Number(t.createdAt) || 0, device: t.device, steps })
    } catch {
      /* a file that isn't a test: skip */
    }
  }
  return out.sort((a, b) => b.createdAt - a.createdAt)
}

async function saveTest(t: SavedTest): Promise<SavedTest> {
  const clean: SavedTest = { name: testFileName(t.name), createdAt: t.createdAt || Date.now(), device: t.device, steps: t.steps.filter(isTestStep) }
  if (!clean.steps.length) throw new Error('A test needs at least one step.')
  await mkdir(dir(), { recursive: true })
  await writeFile(fileOf(clean.name), JSON.stringify(clean, null, 2))
  return clean
}

const broadcast = (channel: string, payload?: unknown): void => {
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send(channel, payload)
}

/**
 * Replays a test's steps. By default on the agent's own second screen (a separate display of the
 * phone), so the user keeps using the phone while it runs; `screen: 'phone'` replays on the phone's
 * own screen. Stops at the first failing step.
 */
export async function runTest(ctl: DeviceController, t: SavedTest, device: string | undefined, onStep?: (r: StepResult) => void, screen: ScreenChoice = 'agent'): Promise<TestRunResult> {
  const results: StepResult[] = []
  let space: Size | null = null
  const toAgent = async (p: NormPoint): Promise<[number, number]> => {
    space ??= (await ctl.uiTree(device, screen)).space
    return [Math.round(p[0] * space.width), Math.round(p[1] * space.height)]
  }
  const run = async (s: TestStep): Promise<string> => {
    switch (s.action) {
      case 'launch_app':
        return ctl.launchApp(s.package, device, screen)
      case 'tap_element': {
        const q = { ...(s.text ? { text: s.text } : {}), ...(s.id ? { id: s.id } : {}), exact: s.exact, index: s.index }
        try {
          return await ctl.tapElement(q, s.long ?? false, device, screen, 4000)
        } catch (e) {
          if (!s.at) throw e
          const [x, y] = await toAgent(s.at)
          return `${await ctl.tap(x, y, device, s.long ? 700 : 60, screen)} (couldn’t find it by name, used where it was)`
        }
      }
      case 'tap': {
        const [x, y] = await toAgent(s.at)
        return ctl.tap(x, y, device, s.long ? 700 : 60, screen)
      }
      case 'swipe': {
        const [x1, y1] = await toAgent(s.from)
        const [x2, y2] = await toAgent(s.to)
        return ctl.swipe({ x: x1, y: y1 }, { x: x2, y: y2 }, Math.min(Math.max(s.ms, 100), 2000), device, screen)
      }
      case 'scroll':
        return ctl.scroll(s.direction, 0.5, device, screen)
      case 'type_text':
        return ctl.typeText(s.text, false, device, screen)
      case 'press_key':
        return ctl.pressKey(s.key, device, screen)
      case 'wait_for':
        return ctl.waitFor({ ...(s.text ? { text: s.text } : {}), ...(s.id ? { id: s.id } : {}), exact: s.exact }, false, s.timeoutMs ?? 6000, device, screen)
    }
  }
  for (const [index, s] of t.steps.entries()) {
    const start = Date.now()
    try {
      const message = await run(s)
      const r = { index, ok: true, message, ms: Date.now() - start }
      results.push(r)
      onStep?.(r)
    } catch (e) {
      const r = { index, ok: false, message: e instanceof Error ? e.message : String(e), ms: Date.now() - start }
      results.push(r)
      onStep?.(r)
      const shot = await ctl.screenshot(device, screen).catch(() => null)
      return { name: t.name, ok: false, results, ...(shot ? { screenshot: `data:${shot.mimeType};base64,${shot.data}` } : {}) }
    }
  }
  return { name: t.name, ok: true, results }
}

export function registerTestsIpc(ctl: DeviceController): void {
  // The recorder reads the screen's elements while the screen is still (before each tap), so the
  // element a tap hits can be named even when the tap changes the screen.
  const snapshots = new Map<string, { nodes: UiNode[]; space: Size; at: number }>()
  const snapshot = async (device: string): Promise<{ nodes: UiNode[]; space: Size }> => {
    const r = await ctl.uiTree(device, 'phone')
    const s = { nodes: r.nodes, space: r.space, at: Date.now() }
    snapshots.set(device, s)
    return s
  }
  const str = (v: unknown): string => {
    if (typeof v !== 'string' || !v) throw new Error('No phone chosen.')
    return v
  }
  const pt = (v: unknown): NormPoint => {
    if (!Array.isArray(v) || v.length !== 2 || !v.every((n) => typeof n === 'number' && n >= 0 && n <= 1)) throw new Error('Bad position.')
    return [v[0] as number, v[1] as number]
  }

  ipcMain.handle('tests:list', () => listTests())
  ipcMain.handle('tests:save', async (_e, t: SavedTest) => {
    const saved = await saveTest(t)
    broadcast('tests:changed')
    return saved
  })
  ipcMain.handle('tests:delete', async (_e, name: unknown) => {
    await rm(fileOf(str(name)), { force: true })
    broadcast('tests:changed')
  })
  /** Recording starts: the app in front becomes the first step, and the screen is read. */
  ipcMain.handle('tests:begin', async (_e, device: unknown) => {
    const d = str(device)
    const info = await ctl.info(d, 'phone')
    await snapshot(d).catch(() => null)
    const pkg = typeof info.foregroundApp === 'string' ? info.foregroundApp : null
    return { model: typeof info.model === 'string' ? info.model : undefined, first: pkg ? ({ action: 'launch_app', package: pkg } satisfies TestStep) : null }
  })
  ipcMain.handle('tests:snapshot', async (_e, device: unknown) => {
    await snapshot(str(device)).catch(() => null)
  })
  ipcMain.handle('tests:describe-tap', async (_e, device: unknown, at: unknown, long: unknown) => {
    const d = str(device)
    const s = snapshots.get(d) ?? (await snapshot(d).catch(() => null))
    const p = pt(at)
    return s ? describeTap(s.nodes, s.space, p, long === true) : ({ action: 'tap', at: p, ...(long === true ? { long: true } : {}) } satisfies TestStep)
  })
  ipcMain.handle('tests:describe-check', async (_e, device: unknown, at: unknown) => {
    const d = str(device)
    // A check reads the screen as it is now (it isn't a tap: nothing changes).
    const s = await snapshot(d)
    return describeCheck(s.nodes, s.space, pt(at))
  })
  ipcMain.handle('tests:run', async (e, name: unknown, device: unknown, screen: unknown) => {
    const t = (await listTests()).find((x) => x.name === str(name))
    if (!t) throw new Error('That test is gone.')
    return runTest(
      ctl,
      t,
      str(device),
      (r) => {
        if (!e.sender.isDestroyed()) e.sender.send('tests:progress', { name: t.name, ...r })
      },
      screen === 'phone' ? 'phone' : 'agent',
    )
  })
}
