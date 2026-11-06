// Thin wrapper around the system adb binary (ADR-4: we do not bundle adb).
import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'
import { promisify } from 'node:util'
import { parseDevicesL, type AdbTransport } from './parse'

const execFileP = promisify(execFile)

export function findAdb(): string | null {
  const candidates = [
    process.env.ADB,
    ...(process.env.PATH ?? '').split(delimiter).map((d) => join(d, 'adb')),
    process.env.ANDROID_HOME && join(process.env.ANDROID_HOME, 'platform-tools', 'adb'),
    process.env.ANDROID_SDK_ROOT && join(process.env.ANDROID_SDK_ROOT, 'platform-tools', 'adb'),
    join(homedir(), 'Library', 'Android', 'sdk', 'platform-tools', 'adb'),
    '/opt/homebrew/bin/adb',
    '/usr/local/bin/adb',
  ]
  for (const c of candidates) if (c && existsSync(c)) return c
  return null
}

export interface Device {
  /** Stable hardware serial (ro.serialno); groups USB + Wi-Fi transports of one phone. */
  id: string
  model: string
  /** Preferred transport first (USB before Wi-Fi). */
  transports: AdbTransport[]
}

export class Adb {
  constructor(readonly path: string) {}

  async run(args: string[], serial?: string, timeoutMs = 15000): Promise<string> {
    const full = serial ? ['-s', serial, ...args] : args
    const { stdout } = await execFileP(this.path, full, { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 })
    return stdout
  }

  spawn(args: string[], serial?: string): ChildProcess {
    return spawn(this.path, serial ? ['-s', serial, ...args] : args, { stdio: ['ignore', 'pipe', 'pipe'] })
  }

  async transports(): Promise<AdbTransport[]> {
    return parseDevicesL(await this.run(['devices', '-l']))
  }

  async getprop(serial: string, name: string): Promise<string> {
    return (await this.run(['shell', 'getprop', name], serial)).trim()
  }

  /** Lists online devices, merging transports that belong to the same phone. */
  async devices(): Promise<{ devices: Device[]; other: AdbTransport[] }> {
    const all = await this.transports()
    const other = all.filter((t) => t.state !== 'device')
    const byId = new Map<string, Device>()
    await Promise.all(
      all
        .filter((t) => t.state === 'device')
        .map(async (t) => {
          const id = (await this.getprop(t.serial, 'ro.serialno').catch(() => '')) || t.serial
          const d = byId.get(id) ?? { id, model: t.model ?? id, transports: [] }
          d.transports.push(t)
          byId.set(id, d)
        }),
    )
    // Stable order: USB first, then IP:port before mDNS names, then alphabetical.
    const rank = (t: AdbTransport): number => (t.kind === 'usb' ? 0 : /^[\d.[]/.test(t.serial) ? 1 : 2)
    for (const d of byId.values()) d.transports.sort((a, b) => rank(a) - rank(b) || a.serial.localeCompare(b.serial))
    const devices = [...byId.values()].sort((a, b) => a.model.localeCompare(b.model) || a.id.localeCompare(b.id))
    return { devices, other }
  }

  push(serial: string, local: string, remote: string): Promise<string> {
    return this.run(['push', local, remote], serial, 60000)
  }

  forward(serial: string, localPort: number, remote: string): Promise<string> {
    return this.run(['forward', `tcp:${localPort}`, remote], serial)
  }

  removeForward(serial: string, localPort: number): Promise<string> {
    return this.run(['forward', '--remove', `tcp:${localPort}`], serial)
  }

  pair(hostPort: string, code: string): Promise<string> {
    return this.run(['pair', hostPort, code], undefined, 30000)
  }

  connect(hostPort: string): Promise<string> {
    return this.run(['connect', hostPort], undefined, 30000)
  }
}
