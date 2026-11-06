// Buffered reader over a net.Socket: read exact byte counts during the handshake,
// then hand any leftover bytes plus the live stream to a consumer.
import type { Socket } from 'node:net'

export class SocketReader {
  private chunks: Buffer[] = []
  private buffered = 0
  private waiter: (() => void) | null = null
  private ended = false
  private error: Error | null = null
  private consumer: ((chunk: Buffer) => void) | null = null

  constructor(private readonly socket: Socket) {
    socket.on('data', (c: Buffer) => {
      if (this.consumer) return this.consumer(c)
      this.chunks.push(c)
      this.buffered += c.length
      this.wake()
    })
    socket.on('end', () => {
      this.ended = true
      this.wake()
    })
    socket.on('error', (e) => {
      this.error = e
      this.wake()
    })
  }

  private wake(): void {
    const w = this.waiter
    this.waiter = null
    w?.()
  }

  /** Resolves with exactly n bytes, or rejects if the socket ends first. */
  async readExact(n: number): Promise<Buffer> {
    while (this.buffered < n) {
      if (this.error) throw this.error
      if (this.ended) throw new Error(`socket closed after ${this.buffered}/${n} bytes`)
      await new Promise<void>((r) => (this.waiter = r))
    }
    const all = Buffer.concat(this.chunks)
    this.chunks = [all.subarray(n)]
    this.buffered = all.length - n
    return all.subarray(0, n)
  }

  /** Switches to streaming: flushes leftovers to `fn`, then forwards every chunk. */
  pipeTo(fn: (chunk: Buffer) => void): void {
    this.consumer = fn
    const rest = Buffer.concat(this.chunks)
    this.chunks = []
    this.buffered = 0
    if (rest.length) fn(rest)
  }
}
