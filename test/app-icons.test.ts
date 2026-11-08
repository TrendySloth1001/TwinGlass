import { describe, expect, it, vi } from 'vitest'
vi.mock('electron', () => ({ app: { getPath: () => '/tmp' } }))
const { iconFolderName, isPackageName, isPng } = await import('../src/main/app-icons')

describe('app icons from the phone app', () => {
  it('accepts only package names (no path tricks)', () => {
    expect(isPackageName('com.whatsapp')).toBe(true)
    expect(isPackageName('com.google.android.apps.maps')).toBe(true)
    expect(isPackageName('../etc/passwd')).toBe(false)
    expect(isPackageName('com.x/../../y')).toBe(false)
    expect(isPackageName('noDots')).toBe(false)
  })
  it('accepts only PNG bytes', () => {
    expect(isPng(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe(true)
    expect(isPng(new Uint8Array([0x3c, 0x73, 0x76, 0x67, 0, 0, 0, 0, 0]))).toBe(false)
  })
  it('makes device ids folder-safe', () => {
    expect(iconFolderName('A024/../x')).toBe('A024_.._x')
    expect(iconFolderName('192.168.1.5:5555')).toBe('192.168.1.5_5555')
  })
})
