import { describe, expect, it } from 'vitest'
import { DeviceMessageParser } from '@shared/scrcpy/device-messages'
import { h264CodecString } from '@shared/scrcpy/h264'
import { clientToVideo, clientToVideoClamped } from '@shared/input/coords'
import { domCodeToKeycode, metaStateOf } from '@shared/input/keycodes'
import { parseDevicesL, transportKind } from '../src/main/adb/parse'

describe('h264CodecString', () => {
  it('reads profile/constraints/level from the SPS', () => {
    const cfg = Uint8Array.from([0, 0, 0, 1, 0x67, 0x64, 0x00, 0x28, 0xac, 0, 0, 1, 0x68, 0xee])
    expect(h264CodecString(cfg)).toBe('avc1.640028')
  })
  it('throws without an SPS', () => {
    expect(() => h264CodecString(Uint8Array.from([0, 0, 1, 0x68, 1]))).toThrow()
  })
})

describe('DeviceMessageParser', () => {
  it('parses clipboard and ack split across chunks', () => {
    const text = Buffer.from('héllo')
    const clip = Buffer.concat([Buffer.from([0]), Buffer.from([0, 0, 0, text.length]), text])
    const ack = Buffer.from([1, 0, 0, 0, 0, 0, 0, 0, 42])
    const all = Buffer.concat([clip, ack])
    const p = new DeviceMessageParser()
    const out = [...p.push(all.subarray(0, 3)), ...p.push(all.subarray(3, 12)), ...p.push(all.subarray(12))]
    expect(out).toEqual([
      { type: 'clipboard', text: 'héllo' },
      { type: 'ackClipboard', sequence: 42n },
    ])
  })
})

describe('coords', () => {
  const video = { width: 1080, height: 2400 }
  // 500x500 element: video is scaled to 225x500, centered with 137.5px bars on each side
  const rect = { left: 0, top: 0, width: 500, height: 500 }
  it('maps the center', () => expect(clientToVideo(250, 250, rect, video)).toEqual({ x: 540, y: 1200 }))
  it('rejects letterbox', () => expect(clientToVideo(10, 250, rect, video)).toBeNull())
  it('clamps during drag', () => expect(clientToVideoClamped(10, 900, rect, video)).toEqual({ x: 0, y: 2399 }))
})

describe('keycodes', () => {
  it('maps DOM codes', () => {
    expect(domCodeToKeycode('KeyA')).toBe(29)
    expect(domCodeToKeycode('KeyZ')).toBe(54)
    expect(domCodeToKeycode('Enter')).toBe(66)
    expect(domCodeToKeycode('Backspace')).toBe(67)
    expect(domCodeToKeycode('Nope')).toBeUndefined()
  })
  it('meta state', () => {
    expect(metaStateOf({ shiftKey: true, altKey: false, ctrlKey: true, metaKey: false })).toBe(0x1001)
  })
})

describe('adb devices -l', () => {
  it('parses wifi (ip and mdns), usb and unauthorized entries', () => {
    const out = [
      'List of devices attached',
      '192.168.0.13:33985     device product:Pacman model:A024 device:Pacman transport_id:3',
      'adb-00015365D000334-OIp020._adb-tls-connect._tcp device product:Pacman model:A024 device:Pacman transport_id:4',
      'R5CT1234ABC            device usb:1-1 product:x model:SM_S918B device:dm3q transport_id:5',
      'ZY22ABC                unauthorized usb:1-2 transport_id:6',
      '',
    ].join('\n')
    const t = parseDevicesL(out)
    expect(t.map((x) => [x.serial.slice(0, 12), x.state, x.kind, x.model, x.transportId])).toEqual([
      ['192.168.0.13', 'device', 'wifi', 'A024', 3],
      ['adb-00015365', 'device', 'wifi', 'A024', 4],
      ['R5CT1234ABC', 'device', 'usb', 'SM_S918B', 5],
      ['ZY22ABC', 'unauthorized', 'usb', undefined, 6],
    ])
  })
  it('classifies transports', () => {
    expect(transportKind('emulator-5554')).toBe('usb')
    expect(transportKind('[fe80::1]:5555')).toBe('wifi')
  })
})
