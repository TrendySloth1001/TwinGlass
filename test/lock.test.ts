import { describe, expect, it } from 'vitest'
import {
  isCredentialPrompt,
  parseTopActivity,
  isTypeableSecret,
  parseAwake,
  parseCredentialType,
  parseIsoDurationSeconds,
  parseKeyguardShowing,
  parseLockCounters,
} from '../src/main/adb/lock'

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

  it('reads failure counter and lockout from dumpsys lock_settings (Android 17 format)', () => {
    const out = '    numFailures=0\n    timeSinceBootOfLastFailure=PT0S\n    lockoutEndTime=PT0S\n    numFailures=0\n'
    expect(parseLockCounters(out)).toEqual({ failures: 0, lockoutSeconds: 0 })
    expect(parseLockCounters('numFailures=5\nlockoutEndTime=PT29.5S')).toEqual({ failures: 5, lockoutSeconds: 29.5 })
    expect(parseLockCounters('')).toEqual({ failures: null, lockoutSeconds: 0 })
    expect(parseIsoDurationSeconds('PT1M30S')).toBe(90)
    expect(parseIsoDurationSeconds('PT2H')).toBe(7200)
  })

  it('reads wakefulness from dumpsys power', () => {
    expect(parseAwake('  mWakefulness=Awake\n')).toBe(true)
    expect(parseAwake('  mWakefulness=Asleep\n')).toBe(false)
    expect(parseAwake('')).toBeNull()
  })

  it('parses the foreground activity (Android 17 format)', () => {
    const line = 'topResumedActivity=ActivityRecord{164407815 u0 com.nothing.launcher/com.android.searchlauncher.SearchLauncher t5398}'
    expect(parseTopActivity(line)).toEqual({ package: 'com.nothing.launcher', activity: 'com.android.searchlauncher.SearchLauncher' })
    expect(parseTopActivity('ActivityRecord{1 u0 com.whatsapp/.Main t2}')).toEqual({ package: 'com.whatsapp', activity: 'com.whatsapp.Main' })
    expect(parseTopActivity('')).toBeNull()
  })

  it('recognises credential prompts narrowly', () => {
    const p = (pkg: string, activity: string): boolean => isCredentialPrompt({ package: pkg, activity })
    expect(p('com.android.settings', 'com.android.settings.password.ConfirmDeviceCredentialActivity')).toBe(true)
    expect(p('com.android.settings', 'com.android.settings.password.ConfirmLockPassword$InternalActivity')).toBe(true)
    expect(p('com.nothing.applocker', 'com.nothing.applocker.AppLockActivity')).toBe(true)
    expect(p('com.whatsapp', 'com.whatsapp.Main')).toBe(false)
    expect(p('com.nothing.launcher', 'com.android.searchlauncher.SearchLauncher')).toBe(false)
    expect(isCredentialPrompt(null)).toBe(false)
  })

  it('only accepts secrets that text injection can type reliably', () => {
    expect(isTypeableSecret('123456')).toBe(true)
    expect(isTypeableSecret('Pa55 word!')).toBe(true)
    expect(isTypeableSecret('')).toBe(false)
    expect(isTypeableSecret('pässwörd')).toBe(false)
  })
})
