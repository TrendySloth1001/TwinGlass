// Installed apps with their labels (⌘K launcher), "open on phone", and launching.
// Labels come from scrcpy-server's own list_apps mode (verified on the A024, 5.0.1: ~0.6 s):
//   " * Calculator                     com.google.android.calculator"   (* = system, - = user app)
import { ipcMain } from 'electron'
import { SCRCPY_VERSION } from '@shared/scrcpy/constants'
import { setClipboard, startApp } from '@shared/scrcpy/control'
import type { Adb } from './adb/adb'
import { deviceIdOf, readIcons } from './app-icons'
import type { ScrcpySession } from './scrcpy/session'

export interface PhoneApp {
  label: string
  pkg: string
  system: boolean
  /** PNG data URL, when the Twinglass phone app has sent this app's icon. */
  icon?: string
}

/**
 * The lister's own copy of the server: the live mirror's JVM loads classes lazily from
 * DEVICE_SERVER_PATH, so that file must never be overwritten while a session runs.
 */
const LIST_SERVER_PATH = '/data/local/tmp/mob-mirror-list.jar'

export function parseAppList(out: string): PhoneApp[] {
  const apps: PhoneApp[] = []
  for (const line of out.split('\n')) {
    const m = /^ ([*-]) (.+?)\s{2,}([\w.]+)\s*$/.exec(line)
    if (m) apps.push({ system: m[1] === '*', label: m[2]!.trim(), pkg: m[3]! })
  }
  return apps.sort((a, b) => a.label.localeCompare(b.label))
}

/** POSIX single-quote a string for `adb shell` (which joins args into one remote command line). */
export function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`
}

/** Links the phone may open: web, mail, phone, maps, market. Anything else is sent as text. */
export function openableUrl(text: string): string | null {
  const t = text.trim()
  if (!t || /\s/.test(t) || t.length > 2048) return null
  if (/^(https?:\/\/|mailto:|tel:|geo:|market:\/\/|intent:)/i.test(t)) return t
  if (/^(www\.)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(t)) return `https://${t}` // "example.com/x"
  return null
}

const cache = new Map<string, { at: number; apps: PhoneApp[] }>()

/** One listing per phone at a time: the lister server deletes its own jar once started, so two
 * parallel runs (e.g. React's dev double-mount, or two windows) made the second one fail. */
const inflight = new Map<string, Promise<PhoneApp[]>>()

export function listApps(adb: Adb, serial: string, serverPath: string, fresh: boolean): Promise<PhoneApp[]> {
  const hit = cache.get(serial)
  if (hit && !fresh && Date.now() - hit.at < 5 * 60_000) return Promise.resolve(hit.apps)
  const running = inflight.get(serial)
  if (running) return running
  const p = readApps(adb, serial, serverPath).finally(() => inflight.delete(serial))
  inflight.set(serial, p)
  return p
}

async function readApps(adb: Adb, serial: string, serverPath: string): Promise<PhoneApp[]> {
  await adb.push(serial, serverPath, LIST_SERVER_PATH)
  const out = await adb.runLoose(
    ['shell', `CLASSPATH=${LIST_SERVER_PATH} app_process / com.genymobile.scrcpy.Server ${SCRCPY_VERSION} list_apps=true`],
    serial,
    30_000,
  )
  const apps = parseAppList(out)
  if (!apps.length) throw new Error('Could not read the app list from the phone.')
  cache.set(serial, { at: Date.now(), apps })
  return apps
}

/**
 * Apps open on one display, top (front) first, from `dumpsys activity activities`. Only that
 * display's own top-level section counts (sections start at column 0: "Display #439 (activities…").
 * Home and Twinglass' own phone app are left out.
 */
export function parseDisplayTasks(out: string, displayId: number): string[] {
  const pkgs: string[] = []
  let inside = false
  for (const line of out.split('\n')) {
    if (/^\S/.test(line)) {
      inside = new RegExp(`^Display #${displayId} \\(`).test(line)
      continue
    }
    if (!inside || !/\* Task\{/.test(line) || !/type=standard/.test(line)) continue
    const pkg = / A=\d+:([\w.]+)/.exec(line)?.[1] ?? / I=([\w.]+)\//.exec(line)?.[1]
    if (pkg && pkg !== 'com.mobmirror.companion' && !pkgs.includes(pkg)) pkgs.push(pkg)
  }
  return pkgs
}

let clipboardSeq = 1n

export function registerPhoneAppsIpc(
  getAdb: () => Adb | null,
  serverPath: () => string,
  getSession: (webContentsId: number) => ScrcpySession | undefined,
): void {
  const ctx = (id: number): { adb: Adb; session: ScrcpySession } => {
    const adb = getAdb()
    const session = getSession(id)
    if (!adb || !session) throw new Error('Mirror a phone first.')
    return { adb, session }
  }
  // The mirrored phone's apps; or, with nothing mirrored (home screen, second screen), a given phone's.
  ipcMain.handle('apps:list', async (e, fresh: unknown, serialArg: unknown) => {
    const adb = getAdb()
    if (!adb) throw new Error('adb not found')
    const serial = getSession(e.sender.id)?.serial ?? (typeof serialArg === 'string' ? serialArg : null)
    if (!serial) throw new Error('Connect a phone first.')
    const [apps, deviceId] = await Promise.all([listApps(adb, serial, serverPath(), fresh === true), deviceIdOf(adb, serial)])
    const icons = readIcons(deviceId)
    return apps.map((a) => (icons.has(a.pkg) ? { ...a, icon: icons.get(a.pkg) } : a))
  })
  // Second screens' app switcher: what's open on this screen, and on the phone itself.
  ipcMain.handle('apps:running', async (e) => {
    const { adb, session } = ctx(e.sender.id)
    const out = await adb.runLoose(['shell', 'dumpsys activity activities'], session.serial, 10_000)
    return { here: session.displayId === null ? [] : parseDisplayTasks(out, session.displayId), phone: parseDisplayTasks(out, 0), displayId: session.displayId }
  })
  ipcMain.handle('apps:launch', (e, pkg: unknown) => {
    const { session } = ctx(e.sender.id)
    if (typeof pkg !== 'string' || !/^[\w.]+$/.test(pkg)) throw new Error('Not a package name.')
    session.sendControl(startApp(pkg))
  })
  /**
   * mode auto: a link opens in the phone's default app, other text goes to its clipboard.
   * copy: always to the clipboard. paste: to the clipboard and pasted into the focused field.
   */
  ipcMain.handle('phone:send', async (e, text: unknown, mode: unknown) => {
    const { adb, session } = ctx(e.sender.id)
    if (typeof text !== 'string' || !text) throw new Error('Nothing to send.')
    const paste = mode === 'paste'
    const url = mode === 'auto' || mode === undefined ? openableUrl(text) : null
    if (url) {
      const out = await adb.runLoose(['shell', `am start -a android.intent.action.VIEW -d ${shellQuote(url)}`], session.serial, 10_000)
      if (/Error|Exception/.test(out)) throw new Error(out.trim().split('\n').pop() ?? 'The phone could not open it.')
      return { kind: 'opened' as const, url }
    }
    session.sendControl(setClipboard(clipboardSeq++, text, paste))
    return { kind: paste ? ('pasted' as const) : ('copied' as const) }
  })
}
