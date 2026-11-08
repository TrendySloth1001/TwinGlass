// Talks to the adb server over its local socket (the protocol the `adb` program itself uses), so
// frequent commands don't start a process each time (~10–40 ms CPU per spawn; several per second
// with three windows open). Protocol: AOSP packages/modules/adb/{OVERVIEW,SERVICES,SYNC}.TXT.
//   request:  4 hex digits (length) + service
//   reply:    "OKAY" | "FAIL" + 4 hex length + message
//   host:transport:<serial> switches the connection to a phone; then shell:/sync:/reverse: run there.
import { readFile, stat } from 'node:fs/promises'
import { connect, type Socket } from 'node:net'

export const ADB_PORT = Number(process.env.ANDROID_ADB_SERVER_PORT) || 5037

/** Usable unless the user points adb at a non-default server socket. */
export const socketUsable = (): boolean => !process.env.ADB_SERVER_SOCKET

export function encodeRequest(service: string): Buffer {
  const body = Buffer.from(service, 'utf8')
  if (body.length > 0xffff) throw new Error('adb request too long')
  return Buffer.concat([Buffer.from(body.length.toString(16).padStart(4, '0'), 'ascii'), body])
}

/** Buffered reader over a socket: exact reads and read-to-end. */
class Reader {
  private chunks: Buffer[] = []
  private size = 0
  private ended = false
  private error: Error | null = null
  private wake: (() => void) | null = null

  constructor(readonly socket: Socket) {
    socket.on('data', (d: Buffer) => {
      this.chunks.push(d)
      this.size += d.length
      this.wake?.()
    })
    socket.on('end', () => {
      this.ended = true
      this.wake?.()
    })
    socket.on('close', () => {
      this.ended = true
      this.wake?.()
    })
    socket.on('error', (e) => {
      this.error = e
      this.wake?.()
    })
  }

  private wait(): Promise<void> {
    return new Promise((r) => (this.wake = r))
  }

  async exact(n: number): Promise<Buffer> {
    while (this.size < n) {
      if (this.error) throw this.error
      if (this.ended) throw new Error('adb server closed the connection')
      await this.wait()
    }
    const all = Buffer.concat(this.chunks)
    this.chunks = [all.subarray(n)]
    this.size = all.length - n
    return all.subarray(0, n)
  }

  async rest(): Promise<Buffer> {
    while (!this.ended) {
      if (this.error) throw this.error
      await this.wait()
    }
    const all = Buffer.concat(this.chunks)
    this.chunks = []
    this.size = 0
    return all
  }

  /** OKAY, or throws with the server's FAIL message. */
  async status(): Promise<void> {
    const s = (await this.exact(4)).toString('ascii')
    if (s === 'OKAY') return
    if (s === 'FAIL') throw new Error((await this.lengthPrefixed()) || 'adb: failed')
    throw new Error(`adb: unexpected reply "${s}"`)
  }

  async lengthPrefixed(): Promise<string> {
    const n = parseInt((await this.exact(4)).toString('ascii'), 16)
    return (await this.exact(n)).toString('utf8')
  }
}

function open(timeoutMs: number): Promise<{ socket: Socket; reader: Reader }> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host: '127.0.0.1', port: ADB_PORT })
    const reader = new Reader(socket)
    socket.setTimeout(timeoutMs, () => socket.destroy(new Error(`adb: timed out after ${timeoutMs} ms`)))
    socket.once('connect', () => resolve({ socket, reader }))
    socket.once('error', reject)
  })
}

/** Opens a connection to a service; with a serial, on that phone (host:transport first). */
async function service(service: string, serial: string | undefined, timeoutMs: number): Promise<{ socket: Socket; reader: Reader }> {
  const c = await open(timeoutMs)
  try {
    if (serial) {
      c.socket.write(encodeRequest(`host:transport:${serial}`))
      await c.reader.status()
    }
    c.socket.write(encodeRequest(service))
    await c.reader.status()
    return c
  } catch (e) {
    c.socket.destroy()
    throw e
  }
}

/** `adb -s serial shell <cmd>`: stdout and stderr together, like runLoose. */
export async function socketShell(serial: string, cmd: string, timeoutMs: number): Promise<string> {
  const { socket, reader } = await service(`shell:${cmd}`, serial, timeoutMs)
  try {
    return (await reader.rest()).toString('utf8')
  } finally {
    socket.destroy()
  }
}

/** Host request with a length-prefixed answer (host:version, host:devices-l, host-serial:…:get-state). */
export async function hostQuery(request: string, timeoutMs = 5000): Promise<string> {
  const { socket, reader } = await service(request, undefined, timeoutMs)
  try {
    return await reader.lengthPrefixed()
  } finally {
    socket.destroy()
  }
}

/** Host request answered with just OKAY (forward / killforward; forward sends a second OKAY). */
export async function hostCommand(request: string, timeoutMs = 5000): Promise<void> {
  const { socket, reader } = await service(request, undefined, timeoutMs)
  try {
    if (request.includes(':forward:')) await reader.status().catch(() => {})
  } finally {
    socket.destroy()
  }
}

/** Device-side service with an OKAY-only answer, e.g. reverse:forward:tcp:a;tcp:b. */
export async function transportCommand(serial: string, request: string, timeoutMs = 5000): Promise<string> {
  const { socket, reader } = await service(request, serial, timeoutMs)
  try {
    // reverse:forward sends a second OKAY once bound; list-forward a length-prefixed list.
    if (request.startsWith('reverse:forward:')) {
      await reader.status()
      return ''
    }
    if (request === 'reverse:list-forward') return await reader.lengthPrefixed()
    return ''
  } finally {
    socket.destroy()
  }
}

const SYNC_DATA_MAX = 64 * 1024

function syncHeader(id: string, n: number): Buffer {
  const b = Buffer.alloc(8)
  b.write(id, 0, 'ascii')
  b.writeUInt32LE(n, 4)
  return b
}

/** `adb push` over the sync protocol: SEND "<path>,<mode>", DATA chunks, DONE <mtime>; reply OKAY/FAIL. */
export async function socketPush(serial: string, local: string, remote: string, timeoutMs = 60_000): Promise<void> {
  const [data, st] = await Promise.all([readFile(local), stat(local)])
  const { socket, reader } = await service('sync:', serial, timeoutMs)
  try {
    const target = Buffer.from(`${remote},${0o100644}`, 'utf8')
    const parts: Buffer[] = [syncHeader('SEND', target.length), target]
    for (let o = 0; o < data.length; o += SYNC_DATA_MAX) {
      const chunk = data.subarray(o, Math.min(o + SYNC_DATA_MAX, data.length))
      parts.push(syncHeader('DATA', chunk.length), chunk)
    }
    parts.push(syncHeader('DONE', Math.floor(st.mtimeMs / 1000)))
    socket.write(Buffer.concat(parts))
    const head = await reader.exact(8)
    const id = head.toString('ascii', 0, 4)
    if (id === 'OKAY') {
      socket.write(syncHeader('QUIT', 0))
      return
    }
    const msg = (await reader.exact(head.readUInt32LE(4))).toString('utf8')
    throw new Error(`adb push failed: ${msg || id}`)
  } finally {
    socket.destroy()
  }
}
