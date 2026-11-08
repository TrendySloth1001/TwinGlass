import { describe, expect, it } from 'vitest'
import { describeParams, videoParams } from '@shared/quality'

describe('quality presets', () => {
  it('auto = high on USB, balanced on Wi-Fi', () => {
    expect(videoParams('auto', 'usb')).toEqual({ maxSize: 1920, videoBitRate: 12_000_000 }) // capped: native added ~50 ms (encoder)
    expect(videoParams('auto', 'wifi')).toEqual({ maxSize: 1600, videoBitRate: 6_000_000 })
  })
  it('max is native on both', () => {
    expect(videoParams('max', 'wifi').maxSize).toBe(0)
    expect(videoParams('max', 'usb').videoBitRate).toBe(24_000_000)
  })
  it('describes params', () => {
    expect(describeParams({ maxSize: 0, videoBitRate: 16_000_000 })).toBe('native · 16 Mbps')
    expect(describeParams({ maxSize: 1024, videoBitRate: 3_000_000 })).toBe('1024 px · 3 Mbps')
  })
})
