import { describe, expect, it } from 'vitest'
import { newestPackage } from '../src/main/agent/controller'

// `dumpsys package packages` (shape verified on a Nothing A024, Android 17).
const DUMP = `Packages:
  Package [com.android.settings] (a1b2c3):
    versionCode=36 minSdk=36 targetSdk=36
    firstInstallTime=2025-01-01 00:00:00
    lastUpdateTime=2026-10-02 09:15:00
  Package [com.example.app] (d4e5f6):
    versionCode=7
    firstInstallTime=2026-11-01 10:00:00
    lastUpdateTime=2026-11-13 14:02:31
  Package [com.other.thing] (0f0f0f):
    lastUpdateTime=2026-11-12 23:59:59
`

describe('build loop: the package an install just updated', () => {
  it('picks the package with the newest lastUpdateTime', () => {
    expect(newestPackage(DUMP)).toBe('com.example.app')
  })
  it('ignores firstInstallTime and returns null without packages', () => {
    expect(newestPackage('  Package [a.b] (1):\n    firstInstallTime=2030-01-01 00:00:00\n')).toBeNull()
    expect(newestPackage('')).toBeNull()
  })
})
