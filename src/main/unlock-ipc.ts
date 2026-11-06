// Unlocking the phone from the Mac. Android marks the PIN/password bouncer FLAG_SECURE, so it is
// black in the mirror; key injection still reaches it. Flow: wake -> `wm dismiss-keyguard` (shows
// the bouncer) -> type the secret over the scrcpy control socket -> Enter -> verify.
//
// Security:
// - The secret is typed through the control socket, never put on an adb shell command line
//   (which would be visible in the phone's process list).
// - "Remember" is opt-in; the secret is encrypted with Electron safeStorage (macOS Keychain-backed)
//   and stored per device (ro.serialno). It never travels back to the renderer.
// - No automatic retries: Android throttles/wipes after failed attempts. A saved secret that fails
//   is forgotten immediately so it can't burn more attempts.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, ipcMain, safeStorage } from 'electron'
import { AndroidKey } from '@shared/input/keycodes'
import { KeyAction } from '@shared/scrcpy/constants'
import { injectKeycode, injectText } from '@shared/scrcpy/control'
import type { Adb } from './adb/adb'
import {
  CREDENTIAL_DUMP,
  isTypeableSecret,
  KEYGUARD_DUMP,
  parseCredentialType,
  parseKeyguardShowing,
  type CredentialType,
} from './adb/lock'
import type { ScrcpySession } from './scrcpy/session'

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export interface UnlockStatus {
  credential: CredentialType
  locked: boolean | null
  /** A secret for this phone is saved (encrypted) on this Mac. */
  saved: boolean
  /** safeStorage (Keychain) is available, so "remember" can be offered. */
  canSave: boolean
}

export interface UnlockRequest {
  /** Omit to use the saved secret. */
  secret?: string
  remember?: boolean
}

// ---- encrypted per-device store ----

const storePath = (): string => join(app.getPath('userData'), 'unlock-secrets.json')

function readStore(): Record<string, string> {
  try {
    return existsSync(storePath()) ? (JSON.parse(readFileSync(storePath(), 'utf8')) as Record<string, string>) : {}
  } catch {
    return {}
  }
}

function writeStore(s: Record<string, string>): void {
  writeFileSync(storePath(), JSON.stringify(s), { mode: 0o600 })
}

function saveSecret(deviceId: string, secret: string): void {
  if (!safeStorage.isEncryptionAvailable()) return
  const s = readStore()
  s[deviceId] = safeStorage.encryptString(secret).toString('base64')
  writeStore(s)
}

function loadSecret(deviceId: string): string | null {
  const enc = readStore()[deviceId]
  if (!enc || !safeStorage.isEncryptionAvailable()) return null
  try {
    return safeStorage.decryptString(Buffer.from(enc, 'base64'))
  } catch {
    return null
  }
}

function forgetSecret(deviceId: string): void {
  const s = readStore()
  if (deviceId in s) {
    delete s[deviceId]
    writeStore(s)
  }
}

// ---- device queries ----

async function deviceId(adb: Adb, serial: string): Promise<string> {
  return (await adb.getprop(serial, 'ro.serialno').catch(() => '')) || serial
}

export async function isLocked(adb: Adb, serial: string): Promise<boolean | null> {
  return parseKeyguardShowing(await adb.runLoose(KEYGUARD_DUMP, serial))
}

async function status(adb: Adb, serial: string): Promise<UnlockStatus> {
  const [locked, creds, id] = await Promise.all([
    isLocked(adb, serial),
    adb.runLoose(CREDENTIAL_DUMP, serial),
    deviceId(adb, serial),
  ])
  return {
    credential: parseCredentialType(creds),
    locked,
    saved: id in readStore(),
    canSave: safeStorage.isEncryptionAvailable(),
  }
}

function press(session: ScrcpySession, keycode: number): void {
  session.sendControl(injectKeycode(KeyAction.DOWN, keycode))
  session.sendControl(injectKeycode(KeyAction.UP, keycode))
}

async function unlock(adb: Adb, session: ScrcpySession, req: UnlockRequest): Promise<{ ok: boolean; message: string }> {
  const serial = session.serial
  const id = await deviceId(adb, serial)
  const st = await status(adb, serial)

  if (st.credential === 'PATTERN') {
    return { ok: false, message: 'This phone uses a pattern lock, which can’t be typed. Switch it to a PIN or password to unlock from the Mac.' }
  }
  const fromStore = req.secret === undefined
  const secret = req.secret ?? loadSecret(id) ?? ''
  const needsSecret = st.credential !== 'NONE'
  if (needsSecret && !secret) return { ok: false, message: 'Enter the phone’s PIN or password.' }
  if (needsSecret && !isTypeableSecret(secret)) {
    return { ok: false, message: 'Only plain ASCII PINs/passwords (letters, digits, symbols) can be typed reliably.' }
  }

  if (st.locked === false) {
    if (req.remember && req.secret) saveSecret(id, req.secret)
    return { ok: true, message: 'The phone is already unlocked.' }
  }

  press(session, AndroidKey.WAKEUP)
  await sleep(350)
  // Shows the PIN/password bouncer (verified available on Android 17: "prompting user for auth if necessary").
  await adb.runLoose(['shell', 'wm', 'dismiss-keyguard'], serial)
  await sleep(700)
  if (needsSecret) {
    session.sendControl(injectText(secret))
    await sleep(150)
    press(session, AndroidKey.ENTER)
  }

  for (let i = 0; i < 14; i++) {
    await sleep(250)
    if ((await isLocked(adb, serial)) === false) {
      if (req.remember && req.secret) saveSecret(id, req.secret)
      return { ok: true, message: 'Unlocked.' }
    }
  }
  if (fromStore) forgetSecret(id) // never let a stale saved PIN burn more attempts
  return {
    ok: false,
    message:
      (fromStore ? 'The saved PIN didn’t work (it may have changed) and has been forgotten. ' : 'The phone is still locked: the PIN may be wrong. ') +
      'Android limits failed attempts, so Mob Mirror never retries on its own.',
  }
}

export function registerUnlockIpc(getAdb: () => Adb | null, getSession: (webContentsId: number) => ScrcpySession | undefined): void {
  const ctx = (id: number): { adb: Adb; session: ScrcpySession } => {
    const adb = getAdb()
    const session = getSession(id)
    if (!adb || !session) throw new Error('Start mirroring the phone first.')
    return { adb, session }
  }
  ipcMain.handle('unlock:status', async (e) => {
    const { adb, session } = ctx(e.sender.id)
    return status(adb, session.serial)
  })
  ipcMain.handle('unlock:run', async (e, req: UnlockRequest) => {
    const { adb, session } = ctx(e.sender.id)
    const clean: UnlockRequest = {
      secret: typeof req?.secret === 'string' ? req.secret : undefined,
      remember: req?.remember === true,
    }
    return unlock(adb, session, clean)
  })
  ipcMain.handle('unlock:forget', async (e) => {
    const { adb, session } = ctx(e.sender.id)
    forgetSecret(await deviceId(adb, session.serial))
  })
}
