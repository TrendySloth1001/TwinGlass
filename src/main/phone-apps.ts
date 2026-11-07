// Installed apps with their labels (⌘K launcher), "open on phone", and launching.
// Labels come from scrcpy-server's own list_apps mode (verified on the A024, 5.0.1: ~0.6 s):
//   " * Calculator                     com.google.android.calculator"   (* = system, - = user app)
import { ipcMain } from 'electron'
import { SCRCPY_VERSION } from '@shared/scrcpy/constants'
import { setClipboard, startApp } from '@shared/scrcpy/control'
import type { Adb } from './adb/adb'
import type { ScrcpySession } from './scrcpy/session'

export interface PhoneApp {
  label: string
  pkg: string
  system: boolean
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

async function listApps(adb: Adb, serial: string, serverPath: string, fresh: boolean): Promise<PhoneApp[]> {
  const hit = cache.get(serial)
  if (hit && !fresh && Date.now() - hit.at < 5 * 60_000) return hit.apps
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
    return listApps(adb, serial, serverPath(), fresh === true)
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
