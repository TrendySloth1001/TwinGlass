// Pure helpers for adb wireless flows and streaming output (unit-tested). Formats: docs/FACTS.md.

/**
 * `adb track-devices -l` streams frames of 4 hex digits (payload length) plus the payload,
 * which uses the same text format as `adb devices -l` without the header line.
 */
export class TrackDevicesParser {
  private buf = ''

  push(chunk: string): string[] {
    this.buf += chunk
    const out: string[] = []
    while (this.buf.length >= 4) {
      const len = Number.parseInt(this.buf.slice(0, 4), 16)
      if (Number.isNaN(len)) throw new Error(`bad track-devices frame: ${JSON.stringify(this.buf.slice(0, 16))}`)
      if (this.buf.length < 4 + len) break
      out.push(this.buf.slice(4, 4 + len))
      this.buf = this.buf.slice(4 + len)
    }
    return out
  }
}

export interface MdnsService {
  name: string
  type: string
  host: string
  port: number
}

/** Parses `adb mdns services` ("name<TAB>type<TAB>ip:port" per line; tolerant of extra whitespace). */
export function parseMdnsServices(output: string): MdnsService[] {
  const out: MdnsService[] = []
  for (const line of output.split('\n')) {
    const parts = line.trim().split(/\s+/)
    if (parts.length < 3) continue
    const type = parts.find((p) => /^_adb[\w-]*\._tcp\.?$/.test(p))
    const addr = parts[parts.length - 1]!
    const m = /^(.+):(\d+)$/.exec(addr)
    if (!type || !m) continue
    out.push({ name: parts[0]!, type: type.replace(/\.$/, ''), host: m[1]!, port: Number(m[2]) })
  }
  return out
}

const ALNUM = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'

export function randomAlnum(n: number, rand: (max: number) => number): string {
  let s = ''
  for (let i = 0; i < n; i++) s += ALNUM[rand(ALNUM.length)]
  return s
}

export interface QrPairing {
  name: string
  password: string
  /** Android Studio format, scanned by Developer options → Wireless debugging → Pair with QR code. */
  payload: string
}

/** Uses alphanumerics only, so no WIFI-QR escaping (\ ; , : ") is ever needed. */
export function makeQrPairing(rand: (max: number) => number): QrPairing {
  const name = `studio-${randomAlnum(10, rand)}`
  const password = randomAlnum(12, rand)
  return { name, password, payload: `WIFI:T:ADB;S:${name};P:${password};;` }
}

/** `adb pair` prints "Successfully paired to <host:port> [guid=...]" on success. */
export function pairSucceeded(output: string): boolean {
  return /Successfully paired/i.test(output)
}

/** `adb connect` exits 0 even on failure, so classify the message instead. */
export function connectSucceeded(output: string): boolean {
  return /\b(connected to|already connected to)\b/i.test(output) && !/failed|cannot|unable/i.test(output)
}

/** Extracts the IPv4 address from `ip -f inet addr show wlan0`. */
export function parseInetAddr(output: string): string | null {
  return /\binet (\d+\.\d+\.\d+\.\d+)\//.exec(output)?.[1] ?? null
}

/** Accepts "ip:port" or "ip" (with defaultPort); returns null when malformed. */
export function normalizeHostPort(input: string, defaultPort?: number): string | null {
  const s = input.trim()
  const m = /^(\d{1,3}(?:\.\d{1,3}){3})(?::(\d{1,5}))?$/.exec(s)
  if (!m) return null
  const port = m[2] ? Number(m[2]) : defaultPort
  if (!port || port > 65535) return null
  return `${m[1]}:${port}`
}

/** A 6-digit pairing code as shown on the phone. */
export function isPairingCode(code: string): boolean {
  return /^\d{6}$/.test(code.trim())
}
