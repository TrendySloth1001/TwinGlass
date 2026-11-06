import { describe, expect, it } from 'vitest'
import { buildServerArgs } from '../src/main/scrcpy/session'

const base = { serial: 's', serverPath: '/x' }

describe('buildServerArgs', () => {
  it('passes stay_awake and max_fps', () => {
    const a = buildServerArgs('1234abcd', { ...base, stayAwake: true, maxFps: 60 })
    expect(a).toContain('stay_awake=true')
    expect(a).toContain('max_fps=60')
  })
  it('only sends clipboard_autosync when turned off (server default is true)', () => {
    expect(buildServerArgs('1', base).some((x) => x.startsWith('clipboard_autosync'))).toBe(false)
    expect(buildServerArgs('1', { ...base, clipboardAutosync: true }).some((x) => x.startsWith('clipboard_autosync'))).toBe(false)
    expect(buildServerArgs('1', { ...base, clipboardAutosync: false })).toContain('clipboard_autosync=false')
  })
})
