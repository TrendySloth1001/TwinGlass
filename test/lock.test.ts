import { describe, expect, it } from 'vitest'
import { isTypeableSecret, parseCredentialType, parseKeyguardShowing } from '../src/main/adb/lock'

describe('lock state parsing', () => {
  it('reads isKeyguardShowing from dumpsys window (Android 17 format)', () => {
    const out = '    mKeyguardOccluded=false mPendingKeyguardOccluded=false\n    isKeyguardShowing=false\n'
    expect(parseKeyguardShowing(out)).toBe(false)
    expect(parseKeyguardShowing(out.replace('isKeyguardShowing=false', 'isKeyguardShowing=true'))).toBe(true)
    expect(parseKeyguardShowing('nothing here')).toBeNull()
    // `dumpsys window policy` (what we poll)
    const policy = '    KeyguardServiceDelegate\n      showing=true\n      deviceHasKeyguard=true\n'
    expect(parseKeyguardShowing(policy)).toBe(true)
    expect(parseKeyguardShowing(policy.replace('showing=true', 'showing=false'))).toBe(false)
  })

  it('reads the primary user credential type from dumpsys lock_settings', () => {
    expect(parseCredentialType('  User State:\n    Quality: 0\n    CredentialType: PIN\n    CredentialType: PIN\n')).toBe('PIN')
    expect(parseCredentialType('CredentialType: PATTERN')).toBe('PATTERN')
    expect(parseCredentialType('CredentialType: PASSWORD')).toBe('PASSWORD')
    expect(parseCredentialType('CredentialType: NONE')).toBe('NONE')
    expect(parseCredentialType('')).toBe('UNKNOWN')
  })

  it('only accepts secrets that text injection can type reliably', () => {
    expect(isTypeableSecret('123456')).toBe(true)
    expect(isTypeableSecret('Pa55 word!')).toBe(true)
    expect(isTypeableSecret('')).toBe(false)
    expect(isTypeableSecret('pässwörd')).toBe(false)
  })
})
