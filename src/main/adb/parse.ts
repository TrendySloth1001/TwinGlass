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

/** `getprop` output ("[ro.product.model]: [A024]") → map. */
export function parseGetprop(out: string): Map<string, string> {
  const m = new Map<string, string>()
  for (const line of out.split('\n')) {
    const x = /^\[([^\]]+)\]: \[(.*)\]\s*$/.exec(line)
    if (x) m.set(x[1]!, x[2]!)
  }
  return m
}

export interface DetailSection {
  title: string
  rows: { label: string; value: string }[]
}

/**
 * Phone details from adb alone (when the Twinglass phone app isn't installed): system properties,
 * battery, screen, memory. The phone app reports more (cameras, sensors, codecs…).
 */
export function adbDetailSections(props: Map<string, string>, battery: string, wmSize: string, wmDensity: string, meminfo: string, df: string): DetailSection[] {
  const p = (k: string): string => props.get(k) ?? ''
  const sec = (title: string, rows: [string, string | undefined | null][]): DetailSection => ({
    title,
    rows: rows.filter((r): r is [string, string] => !!r[1] && r[1].trim() !== '').map(([label, value]) => ({ label, value: value.trim() })),
  })
  const kb = (n: number): string => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} GB` : `${Math.round(n / 1024)} MB`)
  const mem = (k: string): number | null => {
    const x = new RegExp(`^${k}:\\s+(\\d+) kB`, 'm').exec(meminfo)
    return x ? Number(x[1]) : null
  }
  const total = mem('MemTotal')
  const avail = mem('MemAvailable')
  // `df -k /data`: "Filesystem 1K-blocks Used Available Use% Mounted on"
  const d = df.trim().split('\n').pop()?.trim().split(/\s+/) ?? []
  const b = (k: string): string | undefined => new RegExp(`^\\s*${k}: (.+)$`, 'm').exec(battery)?.[1]
  const temp = b('temperature')
  const volt = b('voltage')
  return [
    sec('Device', [
      ['Model', p('ro.product.model')],
      ['Manufacturer', p('ro.product.manufacturer')],
      ['Brand', p('ro.product.brand')],
      ['Device', p('ro.product.device')],
      ['Board', p('ro.product.board')],
      ['Hardware', p('ro.hardware')],
      ['SoC', [p('ro.soc.manufacturer'), p('ro.soc.model')].filter(Boolean).join(' ')],
    ]),
    sec('Android', [
      ['Version', p('ro.build.version.release') && `Android ${p('ro.build.version.release')}`],
      ['API level', p('ro.build.version.sdk')],
      ['Security patch', p('ro.build.version.security_patch')],
      ['Build', p('ro.build.display.id')],
      ['Build ID', p('ro.build.id')],
      ['Incremental', p('ro.build.version.incremental')],
      ['Type', p('ro.build.type') && `${p('ro.build.type')} · ${p('ro.build.tags')}`],
      ['Bootloader', p('ro.bootloader')],
      ['Fingerprint', p('ro.build.fingerprint')],
    ]),
    sec('CPU', [
      ['ABIs', p('ro.product.cpu.abilist').replace(/,/g, ', ')],
      ['Platform', p('ro.board.platform')],
    ]),
    sec('Memory & storage', [
      ['RAM', total ? kb(total) : null],
      ['RAM available', avail ? kb(avail) : null],
      ['Storage', d.length >= 4 && /^\d+$/.test(d[1]!) ? kb(Number(d[1])) : null],
      ['Storage free', d.length >= 4 && /^\d+$/.test(d[3]!) ? kb(Number(d[3])) : null],
    ]),
    sec('Display', [
      ['Resolution', /Physical size:\s*(\S+)/.exec(wmSize)?.[1]?.replace('x', ' × ')],
      ['Density', /Physical density:\s*(\d+)/.exec(wmDensity)?.[1] && `${/Physical density:\s*(\d+)/.exec(wmDensity)![1]} dpi`],
    ]),
    sec('Battery', [
      ['Level', b('level') && `${b('level')}%`],
      ['Temperature', temp && `${(Number(temp) / 10).toFixed(1)} °C`],
      ['Voltage', volt && `${(Number(volt) / 1000).toFixed(2)} V`],
      ['Technology', b('technology')],
    ]),
    sec('Region', [
      ['Language', p('persist.sys.locale') || p('ro.product.locale')],
      ['Time zone', p('persist.sys.timezone')],
    ]),
  ].filter((s) => s.rows.length)
}
