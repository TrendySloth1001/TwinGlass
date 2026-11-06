import { describe, expect, it } from 'vitest'
import {
  connectSucceeded,
  isPairingCode,
  makeQrPairing,
  normalizeHostPort,
  pairSucceeded,
  parseInetAddr,
  parseMdnsServices,
  TrackDevicesParser,
} from '../src/main/adb/wireless'

describe('TrackDevicesParser', () => {
  // Captured from `adb track-devices -l` on the dev machine (2026-11-06).
  const payload =
    '192.168.0.13:33985     device product:MetroidIND model:A024 device:Metroid transport_id:15\n'
  const frame = payload.length.toString(16).padStart(4, '0') + payload

  it('splits frames, including an empty list', () => {
    const p = new TrackDevicesParser()
    expect(p.push(frame + '0000')).toEqual([payload, ''])
  })
  it('handles frames split across chunks', () => {
    const p = new TrackDevicesParser()
    expect([...p.push(frame.slice(0, 2)), ...p.push(frame.slice(2, 30)), ...p.push(frame.slice(30))]).toEqual([payload])
  })
  it('rejects garbage', () => {
    expect(() => new TrackDevicesParser().push('zzzzhello')).toThrow()
  })
})

describe('parseMdnsServices', () => {
  it('parses tab-separated services and ignores the header', () => {
    const out = [
      'List of discovered mdns services',
      'adb-00015365D000334-OIp020\t_adb-tls-connect._tcp\t192.168.0.13:33985',
      'studio-AbCdEf2345\t_adb-tls-pairing._tcp.\t192.168.0.13:41234',
      '',
    ].join('\n')
    expect(parseMdnsServices(out)).toEqual([
      { name: 'adb-00015365D000334-OIp020', type: '_adb-tls-connect._tcp', host: '192.168.0.13', port: 33985 },
      { name: 'studio-AbCdEf2345', type: '_adb-tls-pairing._tcp', host: '192.168.0.13', port: 41234 },
    ])
  })
  it('returns nothing for an empty listing', () => {
    expect(parseMdnsServices('List of discovered mdns services\n\n')).toEqual([])
  })
})

describe('QR pairing', () => {
  it('builds the Android Studio payload', () => {
    let i = 0
    const q = makeQrPairing(() => i++ % 5)
    expect(q.name).toMatch(/^studio-[A-Za-z0-9]{10}$/)
    expect(q.password).toMatch(/^[A-Za-z0-9]{12}$/)
    expect(q.payload).toBe(`WIFI:T:ADB;S:${q.name};P:${q.password};;`)
  })
})

describe('adb output classification', () => {
  it('pair', () => {
    expect(pairSucceeded('Successfully paired to 192.168.0.13:41234 [guid=adb-XYZ]')).toBe(true)
    expect(pairSucceeded('Failed: Wrong password or connection was dropped.')).toBe(false)
  })
  it('connect', () => {
    expect(connectSucceeded('connected to 192.168.0.13:5555')).toBe(true)
    expect(connectSucceeded('already connected to 192.168.0.13:5555')).toBe(true)
    expect(connectSucceeded('failed to connect to 192.168.0.13:5555')).toBe(false)
    expect(connectSucceeded('cannot connect to 192.168.0.13:5555: Connection refused (61)')).toBe(false)
  })
  it('wlan0 address', () => {
    const out = '24: wlan0: <BROADCAST,UP> mtu 1500\n    inet 192.168.0.13/24 brd 192.168.0.255 scope global dynamic wlan0\n'
    expect(parseInetAddr(out)).toBe('192.168.0.13')
    expect(parseInetAddr('Device "wlan0" does not exist.')).toBeNull()
  })
  it('host:port input', () => {
    expect(normalizeHostPort(' 192.168.0.13:37000 ')).toBe('192.168.0.13:37000')
    expect(normalizeHostPort('192.168.0.13', 5555)).toBe('192.168.0.13:5555')
    expect(normalizeHostPort('192.168.0.13')).toBeNull()
    expect(normalizeHostPort('phone.local:5555')).toBeNull()
    expect(normalizeHostPort('1.2.3.4:70000')).toBeNull()
  })
  it('pairing code', () => {
    expect(isPairingCode('123456')).toBe(true)
    expect(isPairingCode('12345')).toBe(false)
  })
})
