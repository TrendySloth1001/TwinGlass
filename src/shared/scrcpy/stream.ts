// Incremental demuxer for one scrcpy 5.0.1 media stream (video or audio), after the
// connection-level dummy byte and device meta have been consumed. Framing: docs/FACTS.md.

export type StreamEvent =
  | { type: 'codec'; codecId: number }
  | { type: 'session'; width: number; height: number; clientResized: boolean }
  | { type: 'config'; data: Uint8Array }
  | { type: 'packet'; pts: bigint; keyFrame: boolean; data: Uint8Array }

const FLAG_CONFIG = 1n << 62n
const FLAG_KEY_FRAME = 1n << 61n
const PTS_MASK = FLAG_KEY_FRAME - 1n

/** Growable byte queue with cheap consumption from the front. */
class ByteQueue {
  private buf = new Uint8Array(64 * 1024)
  private start = 0
  private end = 0

  get length(): number {
    return this.end - this.start
  }

  push(chunk: Uint8Array): void {
    if (this.end + chunk.length > this.buf.length) {
      const len = this.length
      if (len + chunk.length <= this.buf.length) {
        this.buf.copyWithin(0, this.start, this.end)
      } else {
        const next = new Uint8Array(Math.max(this.buf.length * 2, len + chunk.length))
        next.set(this.buf.subarray(this.start, this.end))
        this.buf = next
      }
      this.start = 0
      this.end = len
    }
    this.buf.set(chunk, this.end)
    this.end += chunk.length
  }

  view(len: number): DataView {
    return new DataView(this.buf.buffer, this.buf.byteOffset + this.start, len)
  }

  peek(index: number): number {
    return this.buf[this.start + index] ?? 0
  }

  /** Copies out `len` bytes and consumes them. */
  take(len: number): Uint8Array {
    const out = this.buf.slice(this.start, this.start + len)
    this.skip(len)
    return out
  }

  skip(len: number): void {
    this.start += len
    if (this.start === this.end) this.start = this.end = 0
  }
}

export class StreamDemuxer {
  private q = new ByteQueue()
  private codecRead = false

  /** Feed bytes; returns all events completed by this chunk. */
  push(chunk: Uint8Array): StreamEvent[] {
    this.q.push(chunk)
    const events: StreamEvent[] = []
    for (;;) {
      const ev = this.next()
      if (!ev) break
      events.push(ev)
    }
    return events
  }

  private next(): StreamEvent | null {
    const q = this.q
    if (!this.codecRead) {
      if (q.length < 4) return null
      const codecId = q.view(4).getUint32(0)
      q.skip(4)
      this.codecRead = true
      return { type: 'codec', codecId }
    }
    if (q.length < 12) return null
    if (q.peek(0) & 0x80) {
      const v = q.view(12)
      const ev: StreamEvent = {
        type: 'session',
        clientResized: (v.getUint8(3) & 1) === 1,
        width: v.getUint32(4),
        height: v.getUint32(8),
      }
      q.skip(12)
      return ev
    }
    const v = q.view(12)
    const header = v.getBigUint64(0)
    const size = v.getUint32(8)
    if (q.length < 12 + size) return null
    q.skip(12)
    const data = q.take(size)
    if (header & FLAG_CONFIG) return { type: 'config', data }
    return { type: 'packet', pts: header & PTS_MASK, keyFrame: (header & FLAG_KEY_FRAME) !== 0n, data }
  }
}

/** Parses the 64-byte NUL-padded device name sent on the first socket. */
export function parseDeviceName(field: Uint8Array): string {
  const nul = field.indexOf(0)
  return new TextDecoder().decode(nul === -1 ? field : field.subarray(0, nul))
}
