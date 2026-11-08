import { createECDH } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { FrameReader, hmac, Kind, Opener, pairKey, pairSecret, plainFrame, Sealer, sessionKeys } from '../src/main/direct/protocol'

// Fixed vectors: the phone app's Kotlin implementation (DirectCrypto) asserts the same bytes.
export const VECTOR = {
  shared: Buffer.alloc(32, 7),
  code: '482913',
  phoneNonce: Buffer.alloc(16, 1),
  macNonce: Buffer.alloc(16, 2),
}

describe('direct link protocol', () => {
  it('pairing: same keys from both ECDH sides, code bound in', () => {
    const phone = createECDH('prime256v1')
    const mac = createECDH('prime256v1')
    phone.generateKeys()
    mac.generateKeys()
    expect(phone.getPublicKey().length).toBe(65) // uncompressed point
    const a = pairKey(phone.computeSecret(mac.getPublicKey()), '123456')
    const b = pairKey(mac.computeSecret(phone.getPublicKey()), '123456')
    expect(a.equals(b)).toBe(true)
    expect(pairKey(mac.computeSecret(phone.getPublicKey()), '123457').equals(a)).toBe(false) // wrong code
    expect(hmac(a, 'phone').equals(hmac(b, 'phone'))).toBe(true)
  })

  it('fixed vectors (shared with the Kotlin side)', () => {
    const k = pairKey(VECTOR.shared, VECTOR.code)
    const secret = pairSecret(k)
    const s = sessionKeys(secret, VECTOR.phoneNonce, VECTOR.macNonce)
    const frame = new Sealer(s.up).seal(Kind.JSON, Buffer.from('{"t":"ping"}'))
    expect(k.toString('hex')).toBe('f2be4920cb5f6e9fd02a5aeba268f1f4c7577a3222204e94ea829ee694c444d1')
    expect(secret.toString('hex')).toBe('07c2e9a6126fe7de2cc1666250f4a873e5b5be1d762dd3a7e4785a5865d55476')
    expect(s.up.toString('hex')).toBe('c4fe81fed89a218f2c2a7a0100370277baf883948f00369c6f2417499c4edf0b')
    expect(s.down.toString('hex')).toBe('5cbb92621a11ed1d846245f7c6d1fdfb3e8553bbf6c5e0316022c3e1e768d2e8')
    expect(hmac(k, 'phone').toString('hex')).toBe('74a864d00940bde2822dbebaad416c57c5d94a79330c59d7e30b4a58b33e5c5a')
    expect(frame.toString('hex')).toBe('0000002900000000000000000000000055d3be7a2c0d93b0cc0c498d15f5a556879db1f5dc691d123cd0332a0f')
  })

  it('seals and opens in order; rejects tampering and replay', () => {
    const key = Buffer.alloc(32, 9)
    const sealer = new Sealer(key)
    const reader = new FrameReader()
    const f1 = sealer.seal(Kind.VIDEO, Buffer.from([1, 2, 3]))
    const f2 = sealer.seal(Kind.CONTROL, Buffer.from([4]))
    // Arrives split across TCP chunks.
    const all = Buffer.concat([f1, f2])
    const frames = [...reader.push(all.subarray(0, 7)), ...reader.push(all.subarray(7))]
    const opener = new Opener(key)
    expect(opener.open(frames[0]!)).toEqual({ kind: Kind.VIDEO, payload: Buffer.from([1, 2, 3]) })
    expect(opener.open(frames[1]!)).toEqual({ kind: Kind.CONTROL, payload: Buffer.from([4]) })
    expect(() => new Opener(key).open(frames[1]!)).toThrow() // replay / out of order
    const bad = Buffer.from(frames[0]!)
    bad[14] = bad[14]! ^ 1
    expect(() => new Opener(key).open(bad)).toThrow() // tampered
  })

  it('plain frames are length-prefixed JSON', () => {
    const f = plainFrame({ t: 'hello' })
    expect(f.readUInt32BE(0)).toBe(f.length - 4)
    expect(JSON.parse(new FrameReader().push(f)[0]!.toString())).toEqual({ t: 'hello' })
  })
})
