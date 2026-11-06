import { describe, expect, it } from 'vitest'
import { CodecId } from '@shared/scrcpy/constants'
import { parseDeviceName, StreamDemuxer, type StreamEvent } from '@shared/scrcpy/stream'

function u32(n: number): Buffer {
  const b = Buffer.alloc(4)
  b.writeUInt32BE(n)
  return b
}

function session(w: number, h: number): Buffer {
  return Buffer.concat([u32(0x80000000), u32(w), u32(h)])
}

function media(header: bigint, payload: Buffer): Buffer {
  const b = Buffer.alloc(12)
  b.writeBigUInt64BE(header)
  b.writeUInt32BE(payload.length, 8)
  return Buffer.concat([b, payload])
}

const config = Buffer.from([0, 0, 0, 1, 0x67, 0x64, 0, 0x28, 0, 0, 0, 1, 0x68, 0xee])
const key = Buffer.from([0, 0, 0, 1, 0x65, 1, 2, 3])
const delta = Buffer.from([0, 0, 0, 1, 0x41, 9])

const stream = Buffer.concat([
  u32(CodecId.H264),
  session(1080, 2400),
  media(1n << 62n, config),
  media((1n << 61n) | 1000n, key),
  media(2000n, delta),
  session(2400, 1080),
])

const expected: StreamEvent[] = [
  { type: 'codec', codecId: CodecId.H264 },
  { type: 'session', width: 1080, height: 2400, clientResized: false },
  { type: 'config', data: new Uint8Array(config) },
  { type: 'packet', pts: 1000n, keyFrame: true, data: new Uint8Array(key) },
  { type: 'packet', pts: 2000n, keyFrame: false, data: new Uint8Array(delta) },
  { type: 'session', width: 2400, height: 1080, clientResized: false },
]

describe('StreamDemuxer', () => {
  it('parses a whole stream in one chunk', () => {
    expect(new StreamDemuxer().push(stream)).toEqual(expected)
  })

  it('handles arbitrary chunk boundaries (byte by byte)', () => {
    const d = new StreamDemuxer()
    const out: StreamEvent[] = []
    for (const byte of stream) out.push(...d.push(Uint8Array.of(byte)))
    expect(out).toEqual(expected)
  })

  it('survives large payloads that force buffer growth', () => {
    const big = Buffer.alloc(300_000, 7)
    const d = new StreamDemuxer()
    const s = Buffer.concat([u32(CodecId.H264), media(5n, big)])
    const out = [...d.push(s.subarray(0, 1000)), ...d.push(s.subarray(1000))]
    expect(out[1]).toMatchObject({ type: 'packet', pts: 5n })
    expect((out[1] as { data: Uint8Array }).data.length).toBe(big.length)
  })
})

describe('parseDeviceName', () => {
  it('strips NUL padding', () => {
    const f = Buffer.alloc(64)
    f.write('A024')
    expect(parseDeviceName(f)).toBe('A024')
  })
})
