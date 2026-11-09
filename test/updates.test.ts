import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => '/nonexistent', getVersion: () => '0.1.1' }, BrowserWindow: { getAllWindows: () => [] }, ipcMain: { handle: () => {} }, shell: {} }))

const { parseOutputMetadata, parseVersionCode } = await import('../src/main/bundled-phone-app')
const { compareVersions } = await import('../src/main/update-check')

describe('phone app versions', () => {
  it('reads versionCode/versionName from Gradle output-metadata.json', () => {
    const meta = JSON.stringify({ version: 3, elements: [{ type: 'SINGLE', versionCode: 11, versionName: '0.8.0', outputFile: 'app-release.apk' }] })
    expect(parseOutputMetadata(meta)).toEqual({ version: '0.8.0', code: 11 })
    expect(parseOutputMetadata('{"elements":[]}')).toBeNull()
    expect(parseOutputMetadata('not json')).toBeNull()
  })

  it('reads versionCode from dumpsys package', () => {
    expect(parseVersionCode('    versionCode=10 minSdk=29 targetSdk=35\n    versionName=0.7.1')).toBe(10)
    expect(parseVersionCode('')).toBeNull() // not installed
  })
})

describe('Mac app versions', () => {
  it('compares release tags numerically', () => {
    expect(compareVersions('v0.1.2', '0.1.1')).toBe(1)
    expect(compareVersions('0.1.10', '0.1.9')).toBe(1)
    expect(compareVersions('0.1.1', 'v0.1.1')).toBe(0)
    expect(compareVersions('0.1.0', '0.1.1')).toBe(-1)
  })
})
