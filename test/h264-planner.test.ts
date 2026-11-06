import { describe, expect, it } from 'vitest'
import { CodecId } from '@shared/scrcpy/constants'
import { H264Planner } from '@shared/scrcpy/h264-planner'

const config = Uint8Array.from([0, 0, 0, 1, 0x67, 0x64, 0, 0x20, 0, 0, 0, 1, 0x68, 0xee])
const key = Uint8Array.from([0, 0, 0, 1, 0x65, 1])
const delta = Uint8Array.from([0, 0, 0, 1, 0x41, 2])

describe('H264Planner', () => {
  it('rejects codecs other than H.264/H.265 (e.g. AV1: no hardware decode on the Mac)', () => {
    expect(() => new H264Planner().handle({ type: 'codec', codecId: CodecId.AV1 })).toThrow()
  })

  it('configures on config, merges SPS/PPS into keyframes, passes deltas', () => {
    const p = new H264Planner()
    expect(p.handle({ type: 'codec', codecId: CodecId.H264 })).toEqual([])
    expect(p.handle({ type: 'session', width: 460, height: 1024, clientResized: false })).toEqual([
      { kind: 'size', width: 460, height: 1024 },
    ])
    expect(p.handle({ type: 'config', data: config })).toEqual([{ kind: 'configure', codec: 'avc1.640020' }])
    const [k] = p.handle({ type: 'packet', pts: 10n, keyFrame: true, data: key })
    expect(k).toEqual({ kind: 'decode', type: 'key', timestamp: 10, data: Uint8Array.from([...config, ...key]) })
    expect(p.handle({ type: 'packet', pts: 20n, keyFrame: false, data: delta })).toEqual([
      { kind: 'decode', type: 'delta', timestamp: 20, data: delta },
    ])
  })

  it('drops deltas until a keyframe after config, session or an error', () => {
    const p = new H264Planner()
    p.handle({ type: 'config', data: config })
    expect(p.handle({ type: 'packet', pts: 1n, keyFrame: false, data: delta })).toEqual([])
    p.handle({ type: 'packet', pts: 2n, keyFrame: true, data: key })
    p.requestKeyFrame()
    expect(p.handle({ type: 'packet', pts: 3n, keyFrame: false, data: delta })).toEqual([])
    p.handle({ type: 'packet', pts: 4n, keyFrame: true, data: key })
    p.handle({ type: 'session', width: 1024, height: 460, clientResized: false })
    expect(p.handle({ type: 'packet', pts: 5n, keyFrame: false, data: delta })).toEqual([])
  })

  it('resets (re-configures) on a keyframe when the decode queue is backed up', () => {
    const p = new H264Planner()
    p.handle({ type: 'config', data: config })
    const actions = p.handle({ type: 'packet', pts: 1n, keyFrame: true, data: key }, 3)
    expect(actions.map((a) => a.kind)).toEqual(['configure', 'decode'])
  })

  it('falls behind between keyframes: flush, wait for a keyframe, and request one', () => {
    const p = new H264Planner()
    p.handle({ type: 'config', data: config })
    p.handle({ type: 'packet', pts: 1n, keyFrame: true, data: key })
    expect(p.handle({ type: 'packet', pts: 2n, keyFrame: false, data: delta }, 6)[0]?.kind).toBe('decode')
    expect(p.handle({ type: 'packet', pts: 3n, keyFrame: false, data: delta }, 7).map((a) => a.kind)).toEqual([
      'configure',
      'requestKeyFrame',
    ])
    expect(p.handle({ type: 'packet', pts: 4n, keyFrame: false, data: delta })).toEqual([])
    expect(p.handle({ type: 'packet', pts: 5n, keyFrame: true, data: key }).map((a) => a.kind)).toEqual(['decode'])
  })

  it('ignores packets before any config', () => {
    expect(new H264Planner().handle({ type: 'packet', pts: 1n, keyFrame: true, data: key })).toEqual([])
  })
})
