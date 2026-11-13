// The build loop: watch a build output folder; when a new .apk lands (Gradle, Flutter, React Native
// all write one), install it on the phone in front, restart the app, and optionally replay a recorded
// test on the agent screen. Started and stopped by the user (Build view).
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { existsSync, readdirSync, readFileSync, statSync, watch, writeFileSync, type FSWatcher } from 'node:fs'
import { basename, join } from 'node:path'
import type { DeviceController } from './agent/controller'
import { listTests, runTest } from './tests-ipc'

export interface BuildLoopConfig {
  folder: string | null
  /** A recorded test to replay after each install (on the agent screen), or null. */
  test: string | null
}

export interface BuildEvent {
  at: number
  phase: 'waiting' | 'installing' | 'installed' | 'launched' | 'testing' | 'passed' | 'failed' | 'error'
  message: string
}

export interface BuildLoopStatus {
  config: BuildLoopConfig
  running: boolean
  device: string | null
  events: BuildEvent[]
}

const configFile = (): string => join(app.getPath('userData'), 'build-loop.json')
const loadConfig = (): BuildLoopConfig => {
  try {
    const c = JSON.parse(readFileSync(configFile(), 'utf8')) as Partial<BuildLoopConfig>
    return { folder: typeof c.folder === 'string' && existsSync(c.folder) ? c.folder : null, test: typeof c.test === 'string' ? c.test : null }
  } catch {
    return { folder: null, test: null }
  }
}

export function registerBuildLoop(ctl: DeviceController): void {
  let config = loadConfig()
  let watcher: FSWatcher | null = null
  let device: string | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let busy = false
  let pending: string | null = null
  const events: BuildEvent[] = []

  const emit = (phase: BuildEvent['phase'], message: string): void => {
    const e = { at: Date.now(), phase, message }
    events.push(e)
    if (events.length > 50) events.shift()
    for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('build:event', e)
  }
  const status = (): BuildLoopStatus => ({ config, running: !!watcher, device, events })

  /** Waits until the file stops growing (the build tool has finished writing it). */
  const settled = async (path: string): Promise<boolean> => {
    let last = -1
    for (let i = 0; i < 20; i++) {
      if (!existsSync(path)) return false
      const size = statSync(path).size
      if (size > 0 && size === last) return true
      last = size
      await new Promise((r) => setTimeout(r, 500))
    }
    return false
  }

  const deploy = async (apk: string): Promise<void> => {
    if (!device) return
    if (busy) {
      pending = apk
      return
    }
    busy = true
    try {
      if (!(await settled(apk))) return
      emit('installing', `Installing ${basename(apk)}…`)
      await ctl.installApk(apk, device, true)
      const pkg = await ctl.lastInstalledPackage(device)
      emit('installed', `Installed ${basename(apk)}${pkg ? ` (${pkg})` : ''}`)
      if (pkg) {
        await ctl.stopApp(pkg, device)
        await ctl.launchApp(pkg, device, 'phone')
        emit('launched', `Restarted ${pkg}`)
      }
      if (config.test) {
        const t = (await listTests()).find((x) => x.name === config.test)
        if (t) {
          emit('testing', `Running “${t.name}” on a second screen…`)
          const r = await runTest(ctl, t, device)
          if (r.ok) emit('passed', `“${t.name}” passed (${r.results.length} steps)`)
          else emit('failed', `“${t.name}” failed at step ${r.results.length}: ${r.results.at(-1)?.message ?? ''}`)
        }
      }
    } catch (e) {
      emit('error', e instanceof Error ? e.message : String(e))
    } finally {
      busy = false
      const next = pending
      pending = null
      if (next) void deploy(next)
    }
  }

  const stop = (): void => {
    watcher?.close()
    watcher = null
    if (timer) clearTimeout(timer)
  }
  const start = (dev: string): void => {
    stop()
    if (!config.folder) throw new Error('Choose your build output folder first.')
    device = dev
    // Recursive watching is native on macOS (FSEvents).
    watcher = watch(config.folder, { recursive: true }, (_ev, file) => {
      if (!file || !String(file).toLowerCase().endsWith('.apk')) return
      const path = join(config.folder!, String(file))
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => void deploy(path), 1200)
    })
    emit('waiting', `Watching ${config.folder} for new APKs`)
  }

  ipcMain.handle('build:status', () => status())
  ipcMain.handle('build:choose-folder', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const r = await (win ? dialog.showOpenDialog(win, { properties: ['openDirectory'], message: 'Choose the folder your build writes the APK to' }) : dialog.showOpenDialog({ properties: ['openDirectory'] }))
    if (!r.canceled && r.filePaths[0]) {
      config = { ...config, folder: r.filePaths[0] }
      writeFileSync(configFile(), JSON.stringify(config))
      if (watcher && device) start(device)
    }
    return status()
  })
  ipcMain.handle('build:set-test', (_e, name: unknown) => {
    config = { ...config, test: typeof name === 'string' && name ? name : null }
    writeFileSync(configFile(), JSON.stringify(config))
    return status()
  })
  ipcMain.handle('build:start', (_e, dev: unknown) => {
    if (typeof dev !== 'string' || !dev) throw new Error('Connect a phone first.')
    start(dev)
    return status()
  })
  ipcMain.handle('build:stop', () => {
    stop()
    emit('waiting', 'Stopped watching')
    return status()
  })
  /** Install the newest APK in the folder now, without waiting for a build. */
  ipcMain.handle('build:install-now', async (_e, dev: unknown) => {
    if (typeof dev !== 'string' || !dev) throw new Error('Connect a phone first.')
    if (!config.folder) throw new Error('Choose your build output folder first.')
    const newest = newestApk(config.folder)
    if (!newest) throw new Error('No .apk in that folder yet.')
    device = dev
    await deploy(newest)
    return status()
  })
  /** The command line tool bundled in the app (for "copy install command"). */
  ipcMain.handle('build:cli-path', () => (app.isPackaged ? join(process.resourcesPath, 'bin', 'twinglass') : join(app.getAppPath(), 'resources', 'bin', 'twinglass')))
}

function newestApk(folder: string): string | null {
  let best: { path: string; at: number } | null = null
  const walk = (dir: string, depth: number): void => {
    if (depth > 6) return
    let entries: string[] = []
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const name of entries) {
      if (name.startsWith('.') || name === 'node_modules') continue
      const p = join(dir, name)
      let st
      try {
        st = statSync(p)
      } catch {
        continue
      }
      if (st.isDirectory()) walk(p, depth + 1)
      else if (name.toLowerCase().endsWith('.apk') && (!best || st.mtimeMs > best.at)) best = { path: p, at: st.mtimeMs }
    }
  }
  walk(folder, 0)
  // `best` is assigned inside the closure, which TypeScript's narrowing can't see.
  return (best as { path: string } | null)?.path ?? null
}
