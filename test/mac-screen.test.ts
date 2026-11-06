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
