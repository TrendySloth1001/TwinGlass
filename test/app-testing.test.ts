import { describe, expect, it } from 'vitest'
import { parseCpuinfo, parseGfxinfo, parseLaunchTime, parseMeminfoPss, parsePackageDump, validUri } from '../src/main/agent/app-testing'

// Trimmed real output from the A024 (Android 17), com.google.android.calculator.
describe('app testing parsers', () => {
  it('reads package facts', () => {
    const out = `Packages:
  Package [com.google.android.calculator] (2b1):
    versionCode=85022643 minSdk=32 targetSdk=37
    versionName=9.3 (967717812)
    lastUpdateTime=2026-09-25 20:39:09
    installerPackageName=com.android.vending
    pkgFlags=[ SYSTEM HAS_CODE ALLOW_CLEAR_USER_DATA ]
      firstInstallTime=1970-01-22 08:15:20
    runtime permissions:
      android.permission.POST_NOTIFICATIONS: granted=false, flags=[ USER_SET ]
      android.permission.INTERNET: granted=true
`
    const f = parsePackageDump('com.google.android.calculator', out)!
    expect(f).toMatchObject({ versionName: '9.3 (967717812)', versionCode: 85022643, minSdk: 32, targetSdk: 37, installer: 'com.android.vending', debuggable: false })
    expect(f.granted).toEqual(['android.permission.INTERNET'])
    expect(f.denied).toEqual(['android.permission.POST_NOTIFICATIONS'])
    expect(parsePackageDump('com.other', out)).toBeNull()
  })
  it('reads frame stats, memory, cpu and launch time', () => {
    expect(parseGfxinfo('Total frames rendered: 867\nJanky frames: 24 (2.77%)\nJanky frames (legacy): 80 (9.23%)\n50th percentile: 5ms\n90th percentile: 9ms\n95th percentile: 12ms\n99th percentile: 31ms\n')).toEqual({
      frames: 867,
      janky: 24,
      jankyPercent: 2.77,
      p50: 5,
      p90: 9,
      p95: 12,
      p99: 31,
    })
    expect(parseMeminfoPss('           TOTAL PSS:    70463            TOTAL RSS:   185468')).toBe(70463)
    expect(parseCpuinfo('com.x.app', '19% TOTAL: 7% user\n  4.2% 2210/com.x.app: 3% user + 1.2% kernel\n')).toBe(4.2)
    expect(parseCpuinfo('com.x', '  4.2% 2210/com.x.app: 3% user\n')).toBeNull()
    expect(parseLaunchTime('Status: ok\nLaunchState: COLD\nTotalTime: 412\nWaitTime: 420\n')).toBe(412)
  })
  it('accepts deep links, refuses intent: and spaces', () => {
    expect(validUri('myapp://item/42')).toBe('myapp://item/42')
    expect(validUri('example.com/x')).toBe('https://example.com/x')
    expect(validUri('intent://x#Intent;end')).toBeNull()
    expect(validUri('a b')).toBeNull()
  })
})
