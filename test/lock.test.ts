import { describe, expect, it } from 'vitest'
import {
  isCredentialPrompt,
  parseFocusedWindow,
  promptOwner,
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

  it('recognises app-locker overlays from the focused window (Nothing applocker)', () => {
    const launcher = { package: 'com.whatsapp', activity: 'com.whatsapp.Main' }
    expect(parseFocusedWindow('  mCurrentFocus=Window{5b0e53 u0 com.nothing.launcher/com.android.searchlauncher.SearchLauncher}')).toBe(
      'com.nothing.launcher/com.android.searchlauncher.SearchLauncher',
    )
    expect(parseFocusedWindow('  mCurrentFocus=Window{1a2b u0 com.nothing.applocker}')).toBe('com.nothing.applocker')
    expect(parseFocusedWindow('  mCurrentFocus=null')).toBeNull()
    // Locked app stays resumed underneath; the overlay has focus.
    expect(isCredentialPrompt(launcher, 'com.nothing.applocker')).toBe(true)
    expect(promptOwner(launcher, 'com.nothing.applocker')).toBe('com.nothing.applocker')
    expect(isCredentialPrompt(launcher, 'com.whatsapp/com.whatsapp.Main')).toBe(false)
  })

  it('only accepts secrets that text injection can type reliably', () => {
    expect(isTypeableSecret('123456')).toBe(true)
    expect(isTypeableSecret('Pa55 word!')).toBe(true)
    expect(isTypeableSecret('')).toBe(false)
    expect(isTypeableSecret('pässwörd')).toBe(false)
  })
})

describe('alternate (fingerprint) bouncer', () => {
  it('is showing only while its window exists', async () => {
    const { parseAltBouncerShowing } = await import('../src/main/adb/lock')
    expect(parseAltBouncerShowing('1\n')).toBe(true)
    expect(parseAltBouncerShowing('0\n')).toBe(false)
    expect(parseAltBouncerShowing('')).toBe(false)
  })
})

describe('system BiometricPrompt (WhatsApp app lock)', () => {
  // Trimmed from `uiautomator dump` on the A024 with WhatsApp's lock showing.
  const XML =
    '<hierarchy rotation="0"><node index="0" text="" resource-id="" package="com.android.systemui" bounds="[0,0][1260,2800]">' +
    '<node text="Unlock to use WhatsApp" resource-id="com.android.systemui:id/title" package="com.android.systemui" bounds="[196,2017][1065,2164]" />' +
    '<node text="Use PIN" resource-id="com.android.systemui:id/button_use_credential" class="android.widget.Button" package="com.android.systemui" bounds="[72,2632][336,2776]" />' +
    '</node></hierarchy>'

  it('finds the Use PIN button centre and the screen size', async () => {
    const { parseUseCredentialButton } = await import('../src/main/adb/lock')
    expect(parseUseCredentialButton(XML)).toEqual({ x: 204, y: 2704, screen: { width: 1260, height: 2800 } })
  })
  it('returns null for biometric-only prompts (no Use PIN button)', async () => {
    const { parseUseCredentialButton } = await import('../src/main/adb/lock')
    expect(parseUseCredentialButton(XML.replace(/<node text="Use PIN"[^>]*\/>/, ''))).toBeNull()
  })
  it('counts the prompt as a credential prompt, owned by the app', async () => {
    const { isCredentialPrompt, promptOwner, parseBiometricPromptShowing } = await import('../src/main/adb/lock')
    const wa = { package: 'com.whatsapp', activity: '.authentication.AppAuthenticationActivity' }
    expect(isCredentialPrompt(wa)).toBe(true) // activity name alone
    expect(isCredentialPrompt({ package: 'x', activity: '.Main' }, null, true)).toBe(true)
    expect(promptOwner({ package: 'com.whatsapp', activity: '.Main' }, null, true)).toBe('com.whatsapp')
    expect(parseBiometricPromptShowing('1')).toBe(true)
  })
})
