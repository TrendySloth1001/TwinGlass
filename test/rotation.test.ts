import { describe, expect, it } from 'vitest'
import { parseRotation } from '../src/main/adb/rotation'

// Trimmed from `dumpsys window displays` on the A024 (Android 17) while scrcpy's virtual display
// (id 81) was listed first: display 0 must be picked, not the first block.
const DUMP = `WINDOW MANAGER DISPLAY CONTENTS (dumpsys window displays)
  Display: mDisplayId=81
    mRotation=0 mDeferredRotationPauseCount=0
    mUserRotationMode=USER_ROTATION_FREE mUserRotation=ROTATION_0 mCameraRotationMode=0
  Display: mDisplayId=0 (organized)
    init=1260x2800 480dpi
    mRotation=1 mDeferredRotationPauseCount=0
    mUserRotationMode=USER_ROTATION_LOCKED mUserRotation=ROTATION_90 mCameraRotationMode=0
`

describe('parseRotation', () => {
  it('reads display 0, not the first display', () => {
    expect(parseRotation(DUMP)).toEqual({ rotation: 1, free: false })
  })
  it('reads auto-rotate', () => {
    expect(parseRotation(DUMP.replace('USER_ROTATION_LOCKED', 'USER_ROTATION_FREE'))).toEqual({ rotation: 1, free: true })
  })
  it('returns null without display 0', () => {
    expect(parseRotation('  Display: mDisplayId=81\n    mRotation=0\n')).toBeNull()
  })
})
