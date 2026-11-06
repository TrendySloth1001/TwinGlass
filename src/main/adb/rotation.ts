// Phone rotation through the window manager shell command.
//
// Why not scrcpy's ROTATE_DEVICE: it freezes to the other orientation and then, when auto-rotate
// is on, immediately thaws it again, so the sensor snaps the phone straight back (verified on
// the A024, Android 17: `mUserRotation=ROTATION_90` was set but the display stayed at 0).
// `cmd window user-rotation -d 0 lock N` / `free` is available on Android 10+ (verified).
import type { Adb } from './adb'

export interface RotationState {
  /** 0..3 (ROTATION_0..270) of display 0. */
  rotation: number
  /** true = auto-rotate (USER_ROTATION_FREE). */
  free: boolean
}

/** Parses `dumpsys window displays` for display 0's current rotation and rotation mode. */
export function parseRotation(dump: string): RotationState | null {
  const start = dump.search(/^ {2}Display: mDisplayId=0\b/m)
  if (start < 0) return null
  const rest = dump.slice(start + 1)
  const next = rest.search(/^ {2}Display: mDisplayId=/m)
  const block = next < 0 ? rest : rest.slice(0, next)
  const rot = /^\s+mRotation=(\d)/m.exec(block)
  const mode = /mUserRotationMode=(USER_ROTATION_\w+)/.exec(block)
  if (!rot?.[1] || !mode?.[1]) return null
  return { rotation: Number(rot[1]) & 3, free: mode[1] === 'USER_ROTATION_FREE' }
}

/** Serials where we turned auto-rotate off, so it can be given back. */
const tookAutoRotate = new Set<string>()

async function readRotation(adb: Adb, serial: string): Promise<RotationState | null> {
  return parseRotation(await adb.runLoose(['shell', 'dumpsys window displays'], serial, 5000))
}

/**
 * Toggles portrait ↔ landscape. Locking turns auto-rotate off on the phone, so we remember that
 * and switch auto-rotate back on when the user rotates back to portrait or the mirror ends.
 */
export async function toggleRotation(adb: Adb, serial: string): Promise<RotationState | null> {
  const s = await readRotation(adb, serial)
  if (!s) throw new Error('Could not read the phone’s rotation')
  const target = s.rotation & 1 ? 0 : 1
  if (s.free) tookAutoRotate.add(serial)
  if (target === 0 && tookAutoRotate.has(serial)) {
    tookAutoRotate.delete(serial)
    // Lock to portrait first so the display turns now, then hand control back to the sensor.
    await adb.runLoose(['shell', 'cmd window user-rotation -d 0 lock 0'], serial, 5000)
    await adb.runLoose(['shell', 'cmd window user-rotation -d 0 free'], serial, 5000)
  } else {
    await adb.runLoose(['shell', `cmd window user-rotation -d 0 lock ${target}`], serial, 5000)
  }
  return readRotation(adb, serial)
}

/** Gives auto-rotate back if we took it (called when a mirror session ends). */
export async function restoreAutoRotate(adb: Adb, serial: string): Promise<void> {
  if (!tookAutoRotate.delete(serial)) return
  await adb.runLoose(['shell', 'cmd window user-rotation -d 0 free'], serial, 5000).catch(() => {})
}
