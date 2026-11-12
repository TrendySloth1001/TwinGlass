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
import { KeyAction, MotionAction, PointerId } from '@shared/scrcpy/constants'
import { injectKeycode, injectText, injectTouch } from '@shared/scrcpy/control'
import type { Adb } from './adb/adb'
import {
  CREDENTIAL_DUMP,
  isTypeableSecret,
  KEYGUARD_DUMP,
  parseAwake,
  parseCredentialType,
  parseKeyguardShowing,
  parseLockCounters,
  isCredentialPrompt,
  parseTopActivity,
  TOP_ACTIVITY_DUMP,
  FOCUS_DUMP,
  parseFocusedWindow,
  promptOwner,
  type CredentialType,
  type LockCounters,
  type TopActivity,
  ALT_BOUNCER_DUMP,
  parseAltBouncerShowing,
  BIOMETRIC_PROMPT_DUMP,
  parseBiometricPromptShowing,
  parseUseCredentialButton,
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
  /** Foreground app/activity (e.g. an app lock asking for the PIN while the phone is unlocked). */
  foreground: TopActivity | null
  /** Focused window title (app-lock overlays live here). */
  focusedWindow: string | null
  /** The foreground screen is a recognised PIN prompt (app lock / confirm credential). */
  credentialPrompt: boolean
  /** Package that owns the recognised prompt (e.g. com.nothing.applocker). */
  promptOwner: string | null
}

export interface UnlockRequest {
  /** Omit to use the saved secret. */
  secret?: string
  remember?: boolean
  /**
   * "screen": the phone is unlocked but the current screen asks for the PIN (an app lock that
   * wasn't recognised automatically); the user explicitly confirmed typing it there.
   */
  target?: 'auto' | 'screen'
}

export async function topActivity(adb: Adb, serial: string): Promise<TopActivity | null> {
  return parseTopActivity(await adb.runLoose(TOP_ACTIVITY_DUMP, serial))
}

/** Focused window (app-lock overlays such as com.nothing.applocker show up here, not as activities). */
export async function focusedWindow(adb: Adb, serial: string): Promise<string | null> {
  return parseFocusedWindow(await adb.runLoose(FOCUS_DUMP, serial))
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

const biometricShowing = async (adb: Adb, serial: string): Promise<boolean> =>
  parseBiometricPromptShowing(await adb.runLoose(BIOMETRIC_PROMPT_DUMP, serial, 4000))

async function status(adb: Adb, serial: string): Promise<UnlockStatus> {
  const [locked, creds, id, foreground, focus, bio] = await Promise.all([
    isLocked(adb, serial),
    adb.runLoose(CREDENTIAL_DUMP, serial),
    deviceId(adb, serial),
    topActivity(adb, serial),
    focusedWindow(adb, serial),
    biometricShowing(adb, serial),
  ])
  return {
    credential: parseCredentialType(creds),
    locked,
    saved: id in readStore(),
    canSave: safeStorage.isEncryptionAvailable(),
    touchId: canTouchId(),
    foreground,
    focusedWindow: focus,
    credentialPrompt: locked === false && isCredentialPrompt(foreground, focus, bio),
    promptOwner: locked === false ? promptOwner(foreground, focus, bio) : null,
  }
}

/**
 * Settings → Unlock → "Ask for Touch ID". Off by default (the user's choice: the saved PIN is
 * typed directly). Agent (MCP) unlocks always require Touch ID regardless: a human approves.
 */
let requireTouchId = false

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
    // macOS shows: “Twinglass” is trying to unlock your Android phone.
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

/**
 * App lock / "confirm your PIN" prompt over an unlocked phone: type the secret into the focused
 * field and press Enter. Success = the prompt went away (foreground changed). Never retried: the
 * phone's failure counter tells a wrong PIN apart from "nothing happened".
 */
async function typeIntoPrompt(
  adb: Adb,
  session: ScrcpySession,
  secret: string,
  prompt: TopActivity | null,
  before: LockCounters,
  onSuccess: () => void,
): Promise<{ ok: boolean; message: string }> {
  const serial = session.serial
  const focusBefore = await focusedWindow(adb, serial)
  const bioBefore = await biometricShowing(adb, serial)
  const recognised = isCredentialPrompt(prompt, focusBefore, bioBefore)
  if (bioBefore) {
    // System BiometricPrompt: switch it from fingerprint to the PIN pad first. No "Use PIN"
    // button = the app accepts only biometrics; then nothing is typed (the PIN must never land
    // in some other field).
    const switched = await useCredentialInBiometricPrompt(adb, session)
    if (!switched) {
      return {
        ok: false,
        message: `${prompt?.package ?? 'This app'} only accepts a fingerprint here, not the phone PIN. Use the sensor on the phone.`,
      }
    }
  }
  const screenKey = async (): Promise<string> => {
    const a = await topActivity(adb, serial)
    return `${a ? `${a.package}/${a.activity}` : ''}|${(await focusedWindow(adb, serial)) ?? ''}`
  }
  const keyBefore = await screenKey()
  press(session, AndroidKey.WAKEUP)
  press(session, KEYCODE_DEL, Math.min(secret.length + 4, 24))
  session.sendControl(injectText(secret))
  await sleep(120)
  press(session, AndroidKey.ENTER)
  // Recognised prompt: done when no credential prompt (activity or overlay) is in front any more.
  // Unrecognised screen the user confirmed: done when the screen changed at all.
  const gone = await waitFor(
    async () =>
      recognised
        ? !isCredentialPrompt(await topActivity(adb, serial), await focusedWindow(adb, serial), await biometricShowing(adb, serial))
        : (await screenKey()) !== keyBefore,
    3500,
    250,
  )
  if (gone) {
    onSuccess()
    return { ok: true, message: `Unlocked ${promptOwner(prompt, focusBefore, bioBefore) ?? prompt?.package ?? 'the app'}.` }
  }
  const after = await counters(adb, serial)
  if (before.failures !== null && after.failures !== null && after.failures > before.failures) {
    return { ok: false, message: 'The app’s PIN prompt rejected the PIN. Twinglass never retries a wrong PIN.' }
  }
  return {
    ok: false,
    message:
      'The PIN screen didn’t go away. Tap the PIN field on the mirror first (so it has focus), or this app may use its own PIN rather than the phone’s.',
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
  // Under-display fingerprint phones show the fingerprint overlay instead of the PIN pad: a tap
  // outside the sensor (upper quarter of the screen) brings up the PIN pad.
  if (parseAltBouncerShowing(await adb.runLoose(ALT_BOUNCER_DUMP, serial, 4000))) {
    tapOutsideSensor(session)
    await waitFor(async () => !parseAltBouncerShowing(await adb.runLoose(ALT_BOUNCER_DUMP, serial, 4000)), 1500, 150)
    await sleep(400) // PIN pad animation
  }
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

/** Taps the system BiometricPrompt's "Use PIN" button (found via uiautomator). True when tapped. */
async function useCredentialInBiometricPrompt(adb: Adb, session: ScrcpySession): Promise<boolean> {
  const xml = await adb.runLoose(['shell', 'uiautomator dump /sdcard/.mm-ui.xml >/dev/null 2>&1; cat /sdcard/.mm-ui.xml; rm -f /sdcard/.mm-ui.xml'], session.serial, 10000)
  const btn = parseUseCredentialButton(xml)
  const video = session.videoSize
  if (!btn || !video) return false
  // uiautomator reports display pixels; touches go in the mirror's video coordinates.
  tap(session, (btn.x * video.width) / btn.screen.width, (btn.y * video.height) / btn.screen.height)
  await sleep(700) // the prompt animates from the fingerprint view to the PIN pad
  return true
}

function tap(session: ScrcpySession, x: number, y: number): void {
  const size = session.videoSize
  if (!size) return
  const position = { x, y, screen: size }
  for (const action of [MotionAction.DOWN, MotionAction.UP]) {
    session.sendControl(
      injectTouch({ action, pointerId: PointerId.GENERIC_FINGER, position, pressure: action === MotionAction.DOWN ? 1 : 0, actionButton: 0, buttons: 0 }),
    )
  }
}

/** One finger tap at the top-centre quarter of the screen, in the mirror's video coordinates. */
function tapOutsideSensor(session: ScrcpySession): void {
  const size = session.videoSize
  if (!size) return
  const position = { x: size.width / 2, y: size.height / 4, screen: size }
  for (const action of [MotionAction.DOWN, MotionAction.UP]) {
    session.sendControl(
      injectTouch({ action, pointerId: PointerId.GENERIC_FINGER, position, pressure: action === MotionAction.DOWN ? 1 : 0, actionButton: 0, buttons: 0 }),
    )
  }
}

const KEYCODE_DEL = 67
/** Busy flag per device so ⌘L spam / two windows can't interleave two unlock sequences. */
const inProgress = new Set<string>()

/** keyguard: the phone's lock screen was unlocked (vs an app lock, or nothing to do). */
type UnlockResult = { ok: boolean; message: string; keyguard?: boolean }

async function unlock(adb: Adb, session: ScrcpySession, req: UnlockRequest, forceTouchId = false): Promise<UnlockResult> {
  const serial = session.serial
  const id = await deviceId(adb, serial)
  if (inProgress.has(id)) return { ok: false, message: 'An unlock is already in progress.' }
  inProgress.add(id)
  try {
    const r = await unlockOnce(adb, session, req, id, forceTouchId || requireTouchId)
    // Lock screen done, and an app lock (e.g. WhatsApp behind com.nothing.applocker) now asks for
    // the same PIN: type it once more. Same rules: verified by the failure counter, never retried.
    if (r.ok && r.keyguard) {
      const prompt = await waitFor(async () => (await status(adb, session.serial)).credentialPrompt, 1500, 250)
      if (prompt) {
        const app = await unlockOnce(adb, session, { ...req, remember: false }, id, false, true)
        return app.ok ? { ok: true, message: `Unlocked the phone and ${app.message.replace(/^Unlocked /, '')}` } : { ok: false, message: `Phone unlocked, but the app lock didn’t open: ${app.message}` }
      }
    }
    return r
  } finally {
    inProgress.delete(id)
  }
}

async function unlockOnce(
  adb: Adb,
  session: ScrcpySession,
  req: UnlockRequest,
  id: string,
  gateTouchId: boolean,
  /** Chained right after the lock screen: reuse the PIN already released for this unlock. */
  chained = false,
): Promise<UnlockResult> {
  const gateSaved = async (): Promise<{ ok: true } | { ok: false; message: string }> =>
    gateTouchId && !chained ? confirmWithTouchId() : { ok: true }
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
  // Phone unlocked: either an app-lock style PIN prompt is in front (recognised, or the user
  // confirmed "type into this screen"), or there is nothing to do.
  const appPrompt = st.locked === false && (st.credentialPrompt || req.target === 'screen')
  if (st.locked === false && !appPrompt) {
    press(session, AndroidKey.WAKEUP) // screen may just be off (not locked yet): turn it on
    if (req.remember && req.secret) saveSecret(id, req.secret)
    return { ok: true, message: 'The phone is already unlocked.' }
  }
  if (appPrompt) {
    if (!needsSecret) return { ok: false, message: 'This phone has no PIN set, so there is nothing to type.' }
    if (fromStore) {
      if (!(id in readStore())) return { ok: false, message: 'Enter the phone’s PIN or password.' }
      const gate = await gateSaved()
      if (!gate.ok) return gate
    }
    const secret = req.secret ?? (fromStore ? loadSecret(id) : null) ?? ''
    if (!secret) return { ok: false, message: 'Enter the phone’s PIN or password.' }
    return typeIntoPrompt(adb, session, secret, st.foreground, before, () => {
      if (req.remember && req.secret) saveSecret(id, req.secret)
    })
  }

  if (fromStore) {
    if (!(id in readStore())) return { ok: false, message: 'Enter the phone’s PIN or password.' }
    const gate = await gateSaved()
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
      return { ok: true, keyguard: true, message: pass === 0 ? 'Unlocked.' : 'Unlocked (second try: the PIN screen was slow to appear).' }
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
        'Android limits failed attempts, so Twinglass never retries a wrong PIN.',
    }
  }
  return {
    ok: false,
    message: 'Couldn’t reach the PIN screen (no attempt was used). Wake the phone, then try again.',
  }
}

/**
 * Agent-initiated unlock: only with a PIN the user saved in the app, and only after the user
 * approves with Touch ID on the Mac (the agent never sees or supplies the PIN).
 */
export async function unlockForAgent(adb: Adb, session: ScrcpySession): Promise<{ ok: boolean; message: string }> {
  const id = await deviceId(adb, session.serial)
  // Unlocked, but an app may be asking for the phone's credential (Android's fingerprint prompt,
  // an app lock): that's what the agent needs typed, so only "nothing in front" is "already unlocked".
  const st = await status(adb, session.serial)
  if (st.locked === false && !st.credentialPrompt) {
    return { ok: true, message: 'The phone is already unlocked and no app is asking for the PIN. (A prompt on the agent screen can’t be answered from here: open that app on the phone’s own screen.)' }
  }
  if (!(id in readStore())) {
    return { ok: false, message: 'No PIN is saved for this phone. Ask the user to unlock it once in Twinglass (⌘L) with "Remember".' }
  }
  return unlock(adb, session, {}, true) // agents: always Touch ID, whatever the setting
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
      target: req?.target === 'screen' ? 'screen' : 'auto',
    }
    return unlock(adb, session, clean)
  })
  ipcMain.handle('unlock:set-require-touch-id', (_e, on: unknown) => {
    requireTouchId = on === true
  })
  ipcMain.handle('unlock:forget', async (e) => {
    const { adb, session } = ctx(e.sender.id)
    forgetSecret(await deviceId(adb, session.serial))
  })
}
