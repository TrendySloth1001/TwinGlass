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
