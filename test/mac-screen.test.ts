import { describe, expect, it } from 'vitest'
import { frame } from '../src/main/mac-screen'

describe('Mac-screen stream framing', () => {
  it('u8 type, f64 timestamp, u32 length, payload (big-endian)', () => {
    const f = frame(1, 123456, Uint8Array.of(9, 8, 7))
    const v = new DataView(f.buffer)
    expect(f.length).toBe(16)
    expect(v.getUint8(0)).toBe(1)
    expect(v.getFloat64(1)).toBe(123456)
    expect(v.getUint32(9)).toBe(3)
    expect([...f.subarray(13)]).toEqual([9, 8, 7])
  })
})

describe('extend display sizing', () => {
  it('reads wm size (override wins) and makes a landscape 2x display', async () => {
    const { parseWmSize, extendSize } = await import('../src/main/mac-screen')
    expect(parseWmSize('Physical size: 1260x2800')).toEqual({ width: 1260, height: 2800 })
    expect(parseWmSize('Physical size: 1260x2800\nOverride size: 1080x2400')).toEqual({ width: 1080, height: 2400 })
    expect(extendSize({ width: 1260, height: 2800 })).toEqual({ width: 1400, height: 630 })
  })
})
