import { describe, expect, it } from 'vitest'
import { matchScore } from '../../src/renderer/src/lib/rank'

describe('matchScore', () => {
  it('orders exact > prefix > word prefix > substring > fuzzy', () => {
    expect(matchScore('Home', 'home')).toBe(100)
    expect(matchScore('Calculator', 'calc')).toBe(80)
    expect(matchScore('Google Calculator', 'calc')).toBe(60)
    expect(matchScore('com.google.android.calculator', 'calc')).toBe(60)
    expect(matchScore('Reclaim', 'cla')).toBe(40)
  })
  it('rejects letters scattered over a long package name', () => {
    expect(matchScore('com.google.android.apps.authenticator2', 'home')).toBe(0)
  })
  it('keeps tight fuzzy matches', () => {
    expect(matchScore('WhatsApp', 'wapp')).toBeGreaterThan(0)
  })
})
