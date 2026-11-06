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

/** Only printable ASCII can be typed reliably through scrcpy text injection (docs/FACTS.md). */
export function isTypeableSecret(secret: string): boolean {
  return secret.length > 0 && secret.length <= 64 && /^[\x20-\x7e]+$/.test(secret)
}
