// "Wi-Fi, no setup" link between the Twinglass phone app and this Mac (no developer mode / adb).
// Spec (also in docs/FACTS.md, "Direct link"):
//
//  Transport: TCP to the Mac (port DIRECT_PORT), found by mDNS (_twinglass._tcp).
//  Plain frames (before the session key): u32 length + UTF-8 JSON.
//  Pairing (once):  phone → {t:'pair', id, name, model, pub}   (pub: P-256 uncompressed, base64)
//                   Mac   → {t:'pair', pub, mac}
//                   key   = HKDF-SHA256(ECDH x-coordinate, salt = 6-digit code, info 'twinglass-pair', 32)
//                   phone → {t:'confirm', mac: HMAC(key, 'phone')}   Mac checks (wrong code = fail)
//                   Mac   → {t:'confirm', mac: HMAC(key, 'mac')}     phone checks
//                   secret = HKDF(key, salt '', info 'twinglass-secret', 32), kept by both.
//  Session:         phone → {t:'hello', id, name, model, nonce}   Mac → {t:'hello', nonce, mac}
//                   keys  = HKDF(secret, salt = phoneNonce ‖ macNonce, info 'twinglass-session', 64)
//                           first 32: phone→Mac, last 32: Mac→phone
//  Encrypted frames: u32 length + 12-byte IV (4 zero bytes + u64 counter, per direction) +
//                    AES-256-GCM(ciphertext ‖ 16-byte tag) of [u8 kind][payload].
//                    kind 1 JSON message, 2 video bytes (scrcpy stream framing), 3 control
//                    message (scrcpy control encoding, Mac → phone), 4 device message.
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, timingSafeEqual } from 'node:crypto'

export const DIRECT_PORT = 47200
export const MAX_FRAME = 8 * 1024 * 1024

export const Kind = { JSON: 1, VIDEO: 2, CONTROL: 3, DEVICE: 4 } as const

export function hkdf(ikm: Buffer, salt: Buffer, info: string, len: number): Buffer {
  return Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from(info, 'utf8'), len))
}

export const hmac = (key: Buffer, msg: string): Buffer => createHmac('sha256', key).update(msg, 'utf8').digest()

export function pairKey(sharedX: Buffer, code: string): Buffer {
  return hkdf(sharedX, Buffer.from(code, 'utf8'), 'twinglass-pair', 32)
}

export const pairSecret = (pairKeyBuf: Buffer): Buffer => hkdf(pairKeyBuf, Buffer.alloc(0), 'twinglass-secret', 32)

export function sessionKeys(secret: Buffer, phoneNonce: Buffer, macNonce: Buffer): { up: Buffer; down: Buffer } {
  const k = hkdf(secret, Buffer.concat([phoneNonce, macNonce]), 'twinglass-session', 64)
  return { up: k.subarray(0, 32), down: k.subarray(32, 64) }
}

export const safeEqual = (a: Buffer, b: Buffer): boolean => a.length === b.length && timingSafeEqual(a, b)

/** Plain (pre-session) frame: u32 length + JSON. */
export function plainFrame(msg: object): Buffer {
  const body = Buffer.from(JSON.stringify(msg), 'utf8')
  const head = Buffer.alloc(4)
  head.writeUInt32BE(body.length)
  return Buffer.concat([head, body])
}

function iv(counter: bigint): Buffer {
  const b = Buffer.alloc(12)
  b.writeBigUInt64BE(counter, 4)
  return b
}

/** One direction of an encrypted session (its own key and counter). */
export class Sealer {
  private counter = 0n
  constructor(private readonly key: Buffer) {}

  seal(kind: number, payload: Uint8Array): Buffer {
    const n = this.counter++
    const c = createCipheriv('aes-256-gcm', this.key, iv(n))
    const body = Buffer.concat([c.update(Buffer.of(kind)), c.update(payload), c.final(), c.getAuthTag()])
    const head = Buffer.alloc(16)
    head.writeUInt32BE(12 + body.length)
    iv(n).copy(head, 4)
    return Buffer.concat([head, body])
  }
}

export class Opener {
  private counter = 0n
  constructor(private readonly key: Buffer) {}

  /** Decrypts one frame body (IV + ciphertext + tag). Throws on tampering or a replayed / out-of-order IV. */
  open(frame: Buffer): { kind: number; payload: Buffer } {
    if (frame.length < 12 + 1 + 16) throw new Error('short frame')
    const ivBuf = frame.subarray(0, 12)
    const n = ivBuf.readBigUInt64BE(4)
    if (n !== this.counter) throw new Error('unexpected frame counter')
    this.counter++
    const tag = frame.subarray(frame.length - 16)
    const d = createDecipheriv('aes-256-gcm', this.key, ivBuf)
    d.setAuthTag(tag)
    const plain = Buffer.concat([d.update(frame.subarray(12, frame.length - 16)), d.final()])
    return { kind: plain[0]!, payload: plain.subarray(1) }
  }
}

/** Splits a TCP byte stream into u32-length-prefixed frames. */
export class FrameReader {
  private buf: Buffer = Buffer.alloc(0)

  push(chunk: Buffer): Buffer[] {
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk
    const out: Buffer[] = []
    while (this.buf.length >= 4) {
      const len = this.buf.readUInt32BE(0)
      if (len > MAX_FRAME) throw new Error('frame too large')
      if (this.buf.length < 4 + len) break
      out.push(this.buf.subarray(4, 4 + len))
      this.buf = this.buf.subarray(4 + len)
    }
    return out
  }
}
