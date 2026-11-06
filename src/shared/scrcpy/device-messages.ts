// Incremental parser for device -> client messages on the control socket.
import { DeviceMessageType } from './constants'

export type DeviceMessage =
  | { type: 'clipboard'; text: string }
  | { type: 'ackClipboard'; sequence: bigint }
  | { type: 'uhidOutput'; id: number; data: Uint8Array }

export class DeviceMessageParser {
  private buf = new Uint8Array(0)

  push(chunk: Uint8Array): DeviceMessage[] {
    const merged = new Uint8Array(this.buf.length + chunk.length)
    merged.set(this.buf)
    merged.set(chunk, this.buf.length)
    this.buf = merged

    const out: DeviceMessage[] = []
    let off = 0
    for (;;) {
      const r = parseOne(this.buf, off)
      if (!r) break
      out.push(r.msg)
      off = r.next
    }
    this.buf = this.buf.slice(off)
    return out
  }
}

function parseOne(b: Uint8Array, off: number): { msg: DeviceMessage; next: number } | null {
  if (b.length - off < 1) return null
  const v = new DataView(b.buffer, b.byteOffset)
  const type = b[off]
  switch (type) {
    case DeviceMessageType.CLIPBOARD: {
      if (b.length - off < 5) return null
      const len = v.getUint32(off + 1)
      if (b.length - off < 5 + len) return null
      const text = new TextDecoder().decode(b.subarray(off + 5, off + 5 + len))
      return { msg: { type: 'clipboard', text }, next: off + 5 + len }
    }
    case DeviceMessageType.ACK_CLIPBOARD: {
      if (b.length - off < 9) return null
      return { msg: { type: 'ackClipboard', sequence: v.getBigUint64(off + 1) }, next: off + 9 }
    }
    case DeviceMessageType.UHID_OUTPUT: {
      if (b.length - off < 5) return null
      const id = v.getUint16(off + 1)
      const len = v.getUint16(off + 3)
      if (b.length - off < 5 + len) return null
      return { msg: { type: 'uhidOutput', id, data: b.slice(off + 5, off + 5 + len) }, next: off + 5 + len }
    }
    default:
      throw new Error(`Unknown device message type ${type}`)
  }
}
