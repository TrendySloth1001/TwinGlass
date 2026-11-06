// Pure parsers for adb CLI output (unit-tested).

export type DeviceState = 'device' | 'offline' | 'unauthorized' | 'no permissions' | string
export type TransportKind = 'usb' | 'wifi'

export interface AdbTransport {
  serial: string
  state: DeviceState
  kind: TransportKind
  model?: string
  product?: string
  device?: string
  transportId?: number
}

/** A wireless serial is either "ip:port" or an mDNS instance ("adb-XXX._adb-tls-connect._tcp"). */
export function transportKind(serial: string): TransportKind {
  if (/\._adb-tls-connect\._tcp\.?$/.test(serial) || /\._adb\._tcp\.?$/.test(serial)) return 'wifi'
  if (/^[\d.]+:\d+$/.test(serial) || /^\[[0-9a-f:]+\]:\d+$/i.test(serial)) return 'wifi'
  return 'usb'
}

/** Parses `adb devices -l`. Fields after the state are `key:value` pairs; devpath (e.g. usb:1-1) is ignored. */
export function parseDevicesL(output: string): AdbTransport[] {
  const result: AdbTransport[] = []
  for (const raw of output.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('List of devices') || line.startsWith('*')) continue
    // state can be "no permissions (...)", so split on runs of 2+ spaces or a tab first.
    const m = /^(\S+)\s+(no permissions(?: \([^)]*\))?|\S+)(.*)$/.exec(line)
    if (!m) continue
    const [, serial, state, rest] = m as unknown as [string, string, string, string]
    const t: AdbTransport = { serial, state, kind: transportKind(serial) }
    for (const tok of rest.trim().split(/\s+/)) {
      const i = tok.indexOf(':')
      if (i <= 0) continue
      const key = tok.slice(0, i)
      const value = tok.slice(i + 1)
      if (key === 'model') t.model = value
      else if (key === 'product') t.product = value
      else if (key === 'device') t.device = value
      else if (key === 'transport_id') t.transportId = Number(value)
    }
    result.push(t)
  }
  return result
}

/**
 * Several shell commands in one adb round trip: `a; echo MARK; b; echo MARK; c`. Over Wi-Fi each
 * `adb shell` costs a full round trip plus process start on the phone, so batching the lock poll's
 * three dumpsys calls cuts its cost by about two thirds.
 */
export function batchShellCommand(cmds: string[], marker: string): string {
  return cmds.join(` ; echo ${marker} ; `)
}

/** Splits the combined output of batchShellCommand back into one string per command. */
export function splitBatchOutput(out: string, marker: string, count: number): string[] {
  const parts = out.split(new RegExp(`^${marker}\\r?$`, 'm'))
  const res = parts.slice(0, count).map((p, i) => (i === 0 ? p : p.replace(/^\r?\n/, '')))
  while (res.length < count) res.push('')
  return res
}

export interface Battery {
  level: number
  charging: boolean
}

/** `dumpsys battery`: "level: 87", "AC powered: true" / "USB powered: true" / "Wireless powered". */
export function parseBattery(out: string): Battery | null {
  const level = /^\s*level:\s*(\d+)/m.exec(out)
  if (!level) return null
  return { level: Number(level[1]), charging: /^\s*(AC|USB|Wireless|Dock) powered:\s*true/im.test(out) }
}
