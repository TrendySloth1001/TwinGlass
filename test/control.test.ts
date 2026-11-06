import { describe, expect, it } from 'vitest'
import { ControlType, MotionAction, PointerId } from '@shared/scrcpy/constants'
import {
  getClipboard,
  injectKeycode,
  injectScroll,
  injectText,
  injectTouch,
  setClipboard,
  setDisplayPower,
  startApp,
  toI16FixedPoint,
  toU16FixedPoint,
  utf8Truncate,
} from '@shared/scrcpy/control'

const hex = (b: Uint8Array): string => Buffer.from(b).toString('hex')
const screen = { width: 1080, height: 2400 }

describe('fixed point', () => {
  it('u16 pressure', () => {
    expect(toU16FixedPoint(0)).toBe(0)
    expect(toU16FixedPoint(0.5)).toBe(0x8000)
    expect(toU16FixedPoint(1)).toBe(0xffff)
    expect(toU16FixedPoint(2)).toBe(0xffff)
  })
  it('i16 scroll', () => {
    expect(toI16FixedPoint(1)).toBe(0x7fff)
    expect(toI16FixedPoint(-1)).toBe(-0x8000)
    expect(toI16FixedPoint(0.5)).toBe(0x4000)
  })
})

describe('control messages', () => {
  it('INJECT_KEYCODE is 14 bytes', () => {
    const b = injectKeycode(1, 66, 2, 0x1)
    expect(b.length).toBe(14)
    expect(hex(b)).toBe('00' + '01' + '00000042' + '00000002' + '00000001')
  })

  it('INJECT_TEXT is length-prefixed and capped at 300 bytes', () => {
    expect(hex(injectText('hi'))).toBe('01' + '00000002' + '6869')
    expect(injectText('x'.repeat(500)).length).toBe(5 + 300)
  })

  it('INJECT_TOUCH_EVENT is 32 bytes with the documented layout', () => {
    const b = injectTouch({
      action: MotionAction.DOWN,
      pointerId: PointerId.MOUSE,
      position: { x: 100, y: 200, screen },
      pressure: 1,
      actionButton: 1,
      buttons: 1,
    })
    expect(b.length).toBe(32)
    expect(hex(b)).toBe(
      '02' + '00' + 'ffffffffffffffff' + '00000064' + '000000c8' + '0438' + '0960' + 'ffff' + '00000001' + '00000001',
    )
  })

  it('INJECT_SCROLL_EVENT is 21 bytes; ±16 maps to the i16 extremes', () => {
    const b = injectScroll({ x: 1, y: 2, screen }, 0, 16)
    expect(b.length).toBe(21)
    expect(b[0]).toBe(ControlType.INJECT_SCROLL_EVENT)
    const v = new DataView(b.buffer)
    expect(v.getInt16(13)).toBe(0)
    expect(v.getInt16(15)).toBe(0x7fff)
    expect(new DataView(injectScroll({ x: 1, y: 2, screen }, -16, 0).buffer).getInt16(13)).toBe(-0x8000)
  })

  it('SET_CLIPBOARD: sequence u64, paste u8, u32 len + text', () => {
    expect(hex(setClipboard(7n, 'ab', true))).toBe('09' + '0000000000000007' + '01' + '00000002' + '6162')
  })

  it('simple messages', () => {
    expect(hex(getClipboard(1))).toBe('0801')
    expect(hex(setDisplayPower(false))).toBe('0a00')
    expect(hex(startApp('+org.app'))).toBe('10' + '08' + Buffer.from('+org.app').toString('hex'))
  })

  it('utf8Truncate never splits a code point', () => {
    expect(utf8Truncate('aé', 2)).toEqual(new TextEncoder().encode('a'))
    expect(utf8Truncate('😀', 3).length).toBe(0)
  })
})
