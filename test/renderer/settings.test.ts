import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, sanitizeSettings } from '../../src/renderer/src/hooks/use-settings'

describe('sanitizeSettings', () => {
  it('fills defaults for missing fields', () => {
    expect(sanitizeSettings({})).toEqual(DEFAULT_SETTINGS)
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(sanitizeSettings([1, 2])).toEqual(DEFAULT_SETTINGS)
  })
  it('keeps valid values', () => {
    const s = sanitizeSettings({ quality: 'max', maxFps: 60, theme: 'dark', lastDevice: 'abc', closedSections: ['x'] })
    expect(s).toMatchObject({ quality: 'max', maxFps: 60, theme: 'dark', lastDevice: 'abc', closedSections: ['x'] })
  })
  it('replaces wrong types and unknown enum values with defaults, drops unknown keys', () => {
    const s = sanitizeSettings({ quality: 'ultra', audio: 3, maxFps: 45, autoConnect: 'yes', closedSections: [1], bogus: true })
    expect(s.quality).toBe(DEFAULT_SETTINGS.quality)
    expect(s.audio).toBe(DEFAULT_SETTINGS.audio)
    expect(s.maxFps).toBe(DEFAULT_SETTINGS.maxFps)
    expect(s.autoConnect).toBe(DEFAULT_SETTINGS.autoConnect)
    expect(s.closedSections).toEqual(DEFAULT_SETTINGS.closedSections)
    expect('bogus' in s).toBe(false)
  })
})
