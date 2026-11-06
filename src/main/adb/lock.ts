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

/** Only printable ASCII can be typed reliably through scrcpy text injection (docs/FACTS.md). */
export function isTypeableSecret(secret: string): boolean {
  return secret.length > 0 && secret.length <= 64 && /^[\x20-\x7e]+$/.test(secret)
}
