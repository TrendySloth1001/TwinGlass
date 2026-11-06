import { describe, expect, it } from 'vitest'
import { compareVersions } from '../src/main/update-check'

describe('compareVersions', () => {
  it('compares numerically, ignoring a v prefix and pre-release tags', () => {
    expect(compareVersions('0.2.0', '0.1.9')).toBe(1)
    expect(compareVersions('v1.10.0', '1.9.3')).toBe(1)
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
    expect(compareVersions('1.0.0-beta.2', '1.0.0')).toBe(0)
    expect(compareVersions('0.9', '1.0.0')).toBe(-1)
  })
})
