import { describe, expect, it } from 'vitest'
import { CodecId } from '@shared/scrcpy/constants'
import { H264Planner } from '@shared/scrcpy/h264-planner'
import { hevcCodecString, hevcNalType, unescapeRbsp } from '@shared/scrcpy/hevc'

// Real config packet (VPS+SPS+PPS) from the Nothing A024 (c2.qti.hevc.encoder, max_size=1024), 2026-11-06.
const A024_HEVC_CONFIG = Buffer.from(
  '0000000140010c01ffff016000000300b0000003000003005dac0900000001420101016000000300b0000003000003005da00f080100717e5aee4c92ea6a0a0c0a05da1425000000014401c0e30f03b084',
  'hex',
)

describe('HEVC', () => {
  it('derives the WebCodecs codec string from a real phone SPS', () => {
    expect(hevcCodecString(A024_HEVC_CONFIG)).toBe('hvc1.1.6.L93.B0')
  })
  it('reads NAL types (VPS 32, SPS 33, PPS 34)', () => {
    expect(hevcNalType(Uint8Array.of(0x40, 0x01))).toBe(32)
    expect(hevcNalType(Uint8Array.of(0x42, 0x01))).toBe(33)
    expect(hevcNalType(Uint8Array.of(0x44, 0x01))).toBe(34)
  })
  it('removes emulation-prevention bytes', () => {
    expect(Array.from(unescapeRbsp(Uint8Array.of(1, 0, 0, 3, 0, 5)))).toEqual([1, 0, 0, 0, 5])
  })
  it('throws without an SPS', () => {
    expect(() => hevcCodecString(Uint8Array.of(0, 0, 1, 0x40, 1))).toThrow()
  })
  it('planner configures H.265 and prepends VPS/SPS/PPS to keyframes', () => {
    const p = new H264Planner()
    expect(p.handle({ type: 'codec', codecId: CodecId.H265 })).toEqual([])
    expect(p.handle({ type: 'config', data: new Uint8Array(A024_HEVC_CONFIG) })).toEqual([
      { kind: 'configure', codec: 'hvc1.1.6.L93.B0' },
    ])
    const key = Uint8Array.of(0, 0, 0, 1, 0x26, 1)
    const [a] = p.handle({ type: 'packet', pts: 1n, keyFrame: true, data: key })
    expect(a).toMatchObject({ kind: 'decode', type: 'key' })
    expect((a as { data: Uint8Array }).data.length).toBe(A024_HEVC_CONFIG.length + key.length)
  })
})
