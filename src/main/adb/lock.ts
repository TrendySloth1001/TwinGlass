// Lock-screen state from adb dumpsys output (pure, unit-tested). Formats verified on Android 17
// (Nothing A024): `dumpsys window` has "isKeyguardShowing=true|false"; `dumpsys lock_settings`
// has "CredentialType: PIN" per user (never the credential itself).

export type CredentialType = 'NONE' | 'PIN' | 'PASSWORD' | 'PATTERN' | 'UNKNOWN'

/**
 * Accepts the small `dumpsys window policy` (3 KB: "KeyguardServiceDelegate … showing=false",
 * used for polling) or the full `dumpsys window` (67 KB: "isKeyguardShowing=false").
 */
export function parseKeyguardShowing(dump: string): boolean | null {
  const m = /KeyguardServiceDelegate\s+showing=(true|false)/.exec(dump) ?? /isKeyguardShowing=(true|false)/.exec(dump)
  return m ? m[1] === 'true' : null
}

export const KEYGUARD_DUMP = ['shell', 'dumpsys', 'window', 'policy']
export const CREDENTIAL_DUMP = ['shell', 'dumpsys', 'lock_settings']

/** The first CredentialType line belongs to the primary user (user 0). */
export function parseCredentialType(dumpsysLockSettings: string): CredentialType {
  const m = /CredentialType:\s*([A-Z_]+)/.exec(dumpsysLockSettings)
  switch (m?.[1]) {
    case 'NONE':
      return 'NONE'
    case 'PIN':
      return 'PIN'
    case 'PASSWORD':
    case 'PASSWORD_OR_PIN':
      return 'PASSWORD'
    case 'PATTERN':
      return 'PATTERN'
    default:
      return 'UNKNOWN'
  }
}

export interface LockCounters {
  /** Failed unlock attempts (primary user). Tells "wrong PIN" (+1) from "PIN never reached the bouncer" (+0). */
  failures: number | null
  /** Remaining lockout after too many failures, in seconds (0 = none). */
  lockoutSeconds: number
}

/** ISO-8601 duration as printed by java.time.Duration ("PT0S", "PT29.5S", "PT1M30S", "PT2H"). */
export function parseIsoDurationSeconds(s: string): number {
  const m = /^PT(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(s.trim())
  if (!m) return 0
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)
}

/** From `dumpsys lock_settings` ("numFailures=0", "lockoutEndTime=PT0S"; verified on Android 17). */
export function parseLockCounters(dumpsysLockSettings: string): LockCounters {
  const f = /numFailures=(\d+)/.exec(dumpsysLockSettings)
  const l = /lockoutEndTime=(PT[\w.]+)/.exec(dumpsysLockSettings)
  return { failures: f ? Number(f[1]) : null, lockoutSeconds: l ? parseIsoDurationSeconds(l[1]!) : 0 }
}

/** `dumpsys power`: "mWakefulness=Awake" (also Asleep / Dreaming / Dozing). */
export function parseAwake(dumpsysPower: string): boolean | null {
  const m = /mWakefulness=(\w+)/.exec(dumpsysPower)
  return m ? m[1] === 'Awake' : null
}

export interface TopActivity {
  package: string
  activity: string
}

export const TOP_ACTIVITY_DUMP = ['shell', 'dumpsys activity activities | grep -m1 topResumedActivity']

/** "topResumedActivity=ActivityRecord{164407815 u0 com.nothing.launcher/com.android.searchlauncher.SearchLauncher t5398}" */
export function parseTopActivity(line: string): TopActivity | null {
  const m = /u\d+ ([\w.]+)\/([\w.$]+)/.exec(line)
  if (!m) return null
  const activity = m[2]!.startsWith('.') ? m[1]! + m[2]! : m[2]!
  return { package: m[1]!, activity }
}

/**
 * Focused window: app lockers such as Nothing's `com.nothing.applocker` hold SYSTEM_ALERT_WINDOW /
 * INTERNAL_SYSTEM_WINDOW and draw their PIN prompt as an OVERLAY window on top of the locked app,
 * so the resumed activity stays the locked app. The focused window names the overlay.
 */
export const FOCUS_DUMP = ['shell', 'dumpsys window | grep -m1 "mCurrentFocus=Window"']

/** "  mCurrentFocus=Window{5b0e53 u0 com.nothing.launcher/com.android.searchlauncher.SearchLauncher}" */
export function parseFocusedWindow(line: string): string | null {
  return /mCurrentFocus=Window\{\w+ u\d+ ([^}]+)\}/.exec(line)?.[1]?.trim() ?? null
}

const CREDENTIAL_RE =
  /ConfirmDeviceCredential|ConfirmLock(Password|Pin)|ConfirmCredential|AppLock|applocker|app_?lock|LockedApp|PrivacyLock|PrivateSpaceAuth|BiometricPrompt|UnlockActivity/i

/**
 * Screens that ask for the device PIN/password over an app (app locks, "confirm your PIN" prompts),
 * judged from the resumed activity and the focused window. Deliberately narrow: typing the PIN into
 * anything else (e.g. a chat field) would leak it, so other screens need explicit confirmation.
 */
export function isCredentialPrompt(a: TopActivity | null, focusedWindow: string | null = null): boolean {
  if (a && CREDENTIAL_RE.test(`${a.package}/${a.activity}`)) return true
  return focusedWindow !== null && CREDENTIAL_RE.test(focusedWindow)
}

/** Package (or window title) that owns a recognised prompt, for messages. */
export function promptOwner(a: TopActivity | null, focusedWindow: string | null): string | null {
  if (focusedWindow && CREDENTIAL_RE.test(focusedWindow)) return focusedWindow.split('/')[0]!
  if (a && CREDENTIAL_RE.test(`${a.package}/${a.activity}`)) return a.package
  return null
}

/** Only printable ASCII can be typed reliably through scrcpy text injection (docs/FACTS.md). */
export function isTypeableSecret(secret: string): boolean {
  return secret.length > 0 && secret.length <= 64 && /^[\x20-\x7e]+$/.test(secret)
}

/**
 * The session's lock / app-lock poll as one batched shell call (see Adb.shellBatch): keyguard
 * state, the resumed activity and the focused window, in that order.
 */
export const LOCK_POLL_CMDS = [
  KEYGUARD_DUMP.slice(1).join(' '),
  TOP_ACTIVITY_DUMP[1]!,
  FOCUS_DUMP[1]!,
]
