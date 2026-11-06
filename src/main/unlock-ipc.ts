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
import { app, ipcMain, safeStorage, systemPreferences } from 'electron'
import { AndroidKey } from '@shared/input/keycodes'
import { KeyAction } from '@shared/scrcpy/constants'
import { injectKeycode, injectText } from '@shared/scrcpy/control'
import type { Adb } from './adb/adb'
import {
  CREDENTIAL_DUMP,
  isTypeableSecret,
  KEYGUARD_DUMP,
  parseAwake,
  parseCredentialType,
  parseKeyguardShowing,
  parseLockCounters,
  type CredentialType,
  type LockCounters,
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
  /** Touch ID can be prompted right now; a saved secret is only released after it succeeds. */
  touchId: boolean
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
    touchId: canTouchId(),
  }
}

const canTouchId = (): boolean => process.platform === 'darwin' && systemPreferences.canPromptTouchID()

/**
 * Gate for releasing a saved secret. promptTouchID() is an app-level check (Electron docs: it does
 * not itself protect data), so it runs here in main, before the secret is decrypted, where the
 * renderer can't skip it. No silent fallback: without Touch ID the user types the PIN.
 */
async function confirmWithTouchId(): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!canTouchId()) {
    return { ok: false, message: 'Touch ID isn’t available right now (e.g. lid closed). Type the PIN instead.' }
  }
  try {
    // macOS shows: “Mob Mirror” is trying to unlock your Android phone.
    await systemPreferences.promptTouchID('unlock your Android phone')
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message.toLowerCase() : ''
    if (/lockout|locked/.test(msg)) {
      return { ok: false, message: 'Touch ID is locked after too many tries. Unlock your Mac with its password, or type the phone PIN.' }
    }
    return { ok: false, message: 'Touch ID was cancelled or didn’t match. Nothing was sent to the phone.' }
  }
}

function press(session: ScrcpySession, keycode: number, times = 1): void {
  for (let i = 0; i < times; i++) {
    session.sendControl(injectKeycode(KeyAction.DOWN, keycode))
    session.sendControl(injectKeycode(KeyAction.UP, keycode))
  }
}

async function counters(adb: Adb, serial: string): Promise<LockCounters> {
  return parseLockCounters(await adb.runLoose(CREDENTIAL_DUMP, serial))
}

/** Polls until `check` returns true (or null/false after `timeoutMs`). */
async function waitFor(check: () => Promise<boolean | null>, timeoutMs: number, stepMs = 150): Promise<boolean> {
  const end = Date.now() + timeoutMs
  for (;;) {
    if ((await check()) === true) return true
    if (Date.now() >= end) return false
    await sleep(stepMs)
  }
}

/** One wake → bouncer → type → Enter → verify pass. Returns true when the phone unlocked. */
async function attempt(adb: Adb, session: ScrcpySession, secret: string | null): Promise<boolean> {
  const serial = session.serial
  press(session, AndroidKey.WAKEUP)
  // Wait for the screen to actually be on instead of a fixed delay (slow when the phone was asleep).
  await waitFor(async () => parseAwake(await adb.runLoose(['shell', 'dumpsys', 'power'], serial)), 2000)
  // Shows the PIN/password bouncer (verified on Android 17: "prompting user for auth if necessary").
  await adb.runLoose(['shell', 'wm', 'dismiss-keyguard'], serial)
  await sleep(650) // bouncer slide-in animation; it is FLAG_SECURE so we can't watch it
  if (secret) {
    // Clear anything already typed (e.g. the user started on the phone); DEL on an empty field is a no-op.
    press(session, KEYCODE_DEL, Math.min(secret.length + 4, 24))
    session.sendControl(injectText(secret))
    await sleep(120)
    press(session, AndroidKey.ENTER)
  }
  return waitFor(async () => {
    const locked = await isLocked(adb, serial)
    return locked === null ? null : !locked
  }, 3500, 200)
}

const KEYCODE_DEL = 67
/** Busy flag per device so ⌘L spam / two windows can't interleave two unlock sequences. */
const inProgress = new Set<string>()

async function unlock(adb: Adb, session: ScrcpySession, req: UnlockRequest): Promise<{ ok: boolean; message: string }> {
  const serial = session.serial
  const id = await deviceId(adb, serial)
  if (inProgress.has(id)) return { ok: false, message: 'An unlock is already in progress.' }
  inProgress.add(id)
  try {
    return await unlockOnce(adb, session, req, id)
  } finally {
    inProgress.delete(id)
  }
}

async function unlockOnce(adb: Adb, session: ScrcpySession, req: UnlockRequest, id: string): Promise<{ ok: boolean; message: string }> {
  const serial = session.serial
  const [st, before] = await Promise.all([status(adb, serial), counters(adb, serial)])

  if (before.lockoutSeconds > 0) {
    return { ok: false, message: `The phone is locked out for ${Math.ceil(before.lockoutSeconds)} s after failed attempts. Try again later.` }
  }
  if (st.credential === 'PATTERN') {
    return { ok: false, message: 'This phone uses a pattern lock, which can’t be typed. Switch it to a PIN or password to unlock from the Mac.' }
  }
  const needsSecret = st.credential !== 'NONE'
  const fromStore = req.secret === undefined && needsSecret
  if (req.secret !== undefined && !isTypeableSecret(req.secret)) {
    return { ok: false, message: 'Only plain ASCII PINs/passwords (letters, digits, symbols) can be typed reliably.' }
  }

  // Checked before Touch ID, so an unlocked phone never triggers a fingerprint prompt.
  if (st.locked === false) {
    press(session, AndroidKey.WAKEUP) // screen may just be off (not locked yet): turn it on
    if (req.remember && req.secret) saveSecret(id, req.secret)
    return { ok: true, message: 'The phone is already unlocked.' }
  }

  if (fromStore) {
    if (!(id in readStore())) return { ok: false, message: 'Enter the phone’s PIN or password.' }
    const gate = await confirmWithTouchId()
    if (!gate.ok) return gate
  }
  const secret = req.secret ?? (fromStore ? loadSecret(id) : null) ?? ''
  if (needsSecret && !secret) return { ok: false, message: 'Enter the phone’s PIN or password.' }

  // Up to two passes. A second pass happens ONLY if the phone's failure counter did not move, i.e.
  // the PIN never reached the bouncer (it wasn't up yet) and no attempt was consumed. A wrong PIN
  // (counter +1) is never retried.
  let reached = false
  for (let pass = 0; pass < 2; pass++) {
    if (await attempt(adb, session, needsSecret ? secret : null)) {
      if (req.remember && req.secret) saveSecret(id, req.secret)
      return { ok: true, message: pass === 0 ? 'Unlocked.' : 'Unlocked (second try: the PIN screen was slow to appear).' }
    }
    const after = await counters(adb, serial)
    if (before.failures !== null && after.failures !== null && after.failures > before.failures) {
      reached = true
      break
    }
    if (before.failures === null || after.failures === null) break // can't tell: don't risk a retry
  }

  if (reached) {
    if (fromStore) forgetSecret(id) // never let a stale saved PIN burn more attempts
    return {
      ok: false,
      message:
        (fromStore ? 'The saved PIN was rejected (it may have changed) and has been forgotten. ' : 'The phone rejected the PIN. ') +
        'Android limits failed attempts, so Mob Mirror never retries a wrong PIN.',
    }
  }
  return {
    ok: false,
    message: 'Couldn’t reach the PIN screen (no attempt was used). Wake the phone, then try again.',
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
