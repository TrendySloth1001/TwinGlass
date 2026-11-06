// Encoders for client -> device control messages (big-endian). Layouts: docs/FACTS.md.
import {
  ControlType,
  CopyKey,
  INJECT_TEXT_MAX_LENGTH,
  SET_CLIPBOARD_TEXT_MAX_LENGTH,
} from './constants'

const utf8 = new TextEncoder()

export interface Size {
  width: number
  height: number
}

export interface Position {
  x: number
  y: number
  /** Must equal the current video size from the latest session packet, or the server drops the event. */
  screen: Size
}

/** Float in [0, 1] -> u16 fixed point (0xffff == 1.0). */
export function toU16FixedPoint(f: number): number {
  const v = Math.round(Math.min(Math.max(f, 0), 1) * 65536)
  return Math.min(v, 0xffff)
}

/** Float in [-1, 1] -> i16 fixed point. */
export function toI16FixedPoint(f: number): number {
  const v = Math.round(Math.min(Math.max(f, -1), 1) * 32768)
  return Math.min(Math.max(v, -0x8000), 0x7fff)
}

/** Truncate UTF-8 bytes to at most maxBytes without splitting a code point. */
export function utf8Truncate(text: string, maxBytes: number): Uint8Array {
  const bytes = utf8.encode(text)
  if (bytes.length <= maxBytes) return bytes
  let end = maxBytes
  while (end > 0 && ((bytes[end] ?? 0) & 0xc0) === 0x80) end--
  return bytes.subarray(0, end)
}

function writePosition(view: DataView, offset: number, p: Position): number {
  view.setInt32(offset, Math.round(p.x))
  view.setInt32(offset + 4, Math.round(p.y))
  view.setUint16(offset + 8, p.screen.width)
  view.setUint16(offset + 10, p.screen.height)
  return offset + 12
}

export function injectKeycode(action: number, keycode: number, repeat = 0, metaState = 0): Uint8Array {
  const buf = new Uint8Array(14)
  const v = new DataView(buf.buffer)
  v.setUint8(0, ControlType.INJECT_KEYCODE)
  v.setUint8(1, action)
  v.setInt32(2, keycode)
  v.setInt32(6, repeat)
  v.setInt32(10, metaState)
  return buf
}

export function injectText(text: string): Uint8Array {
  const bytes = utf8Truncate(text, INJECT_TEXT_MAX_LENGTH)
  const buf = new Uint8Array(5 + bytes.length)
  const v = new DataView(buf.buffer)
  v.setUint8(0, ControlType.INJECT_TEXT)
  v.setUint32(1, bytes.length)
  buf.set(bytes, 5)
  return buf
}

export interface TouchEvent {
  action: number
  pointerId: bigint
  position: Position
  /** 0..1 */
  pressure: number
  actionButton: number
  buttons: number
}

export function injectTouch(e: TouchEvent): Uint8Array {
  const buf = new Uint8Array(32)
  const v = new DataView(buf.buffer)
  v.setUint8(0, ControlType.INJECT_TOUCH_EVENT)
  v.setUint8(1, e.action)
  v.setBigInt64(2, e.pointerId)
  let o = writePosition(v, 10, e.position)
  v.setUint16(o, toU16FixedPoint(e.pressure))
  o += 2
  v.setInt32(o, e.actionButton)
  v.setInt32(o + 4, e.buttons)
  return buf
}

/** hscroll/vscroll in [-16, 16] (wheel "clicks"); positive vscroll scrolls up. */
export function injectScroll(position: Position, hscroll: number, vscroll: number, buttons = 0): Uint8Array {
  const buf = new Uint8Array(21)
  const v = new DataView(buf.buffer)
  v.setUint8(0, ControlType.INJECT_SCROLL_EVENT)
  const o = writePosition(v, 1, position)
  v.setInt16(o, toI16FixedPoint(hscroll / 16))
  v.setInt16(o + 2, toI16FixedPoint(vscroll / 16))
  v.setInt32(o + 4, buttons)
  return buf
}

export function backOrScreenOn(action: number): Uint8Array {
  return Uint8Array.of(ControlType.BACK_OR_SCREEN_ON, action)
}

export const expandNotificationPanel = (): Uint8Array => Uint8Array.of(ControlType.EXPAND_NOTIFICATION_PANEL)
export const expandSettingsPanel = (): Uint8Array => Uint8Array.of(ControlType.EXPAND_SETTINGS_PANEL)
export const collapsePanels = (): Uint8Array => Uint8Array.of(ControlType.COLLAPSE_PANELS)
export const rotateDevice = (): Uint8Array => Uint8Array.of(ControlType.ROTATE_DEVICE)
export const resetVideo = (): Uint8Array => Uint8Array.of(ControlType.RESET_VIDEO)
export const openHardKeyboardSettings = (): Uint8Array => Uint8Array.of(ControlType.OPEN_HARD_KEYBOARD_SETTINGS)

export function getClipboard(copyKey: number = CopyKey.NONE): Uint8Array {
  return Uint8Array.of(ControlType.GET_CLIPBOARD, copyKey)
}

export function setClipboard(sequence: bigint, text: string, paste: boolean): Uint8Array {
  const bytes = utf8Truncate(text, SET_CLIPBOARD_TEXT_MAX_LENGTH)
  const buf = new Uint8Array(14 + bytes.length)
  const v = new DataView(buf.buffer)
  v.setUint8(0, ControlType.SET_CLIPBOARD)
  v.setBigUint64(1, sequence)
  v.setUint8(9, paste ? 1 : 0)
  v.setUint32(10, bytes.length)
  buf.set(bytes, 14)
  return buf
}

export function setDisplayPower(on: boolean): Uint8Array {
  return Uint8Array.of(ControlType.SET_DISPLAY_POWER, on ? 1 : 0)
}

/** Asks the device media scanner to index a pushed file (so it shows up in Gallery/Files). */
export function scanFile(devicePath: string): Uint8Array {
  const bytes = utf8Truncate(devicePath, 256)
  const buf = new Uint8Array(5 + bytes.length)
  const v = new DataView(buf.buffer)
  v.setUint8(0, ControlType.SCAN_FILE)
  v.setUint32(1, bytes.length)
  buf.set(bytes, 5)
  return buf
}

export function startApp(name: string): Uint8Array {
  const bytes = utf8Truncate(name, 255)
  const buf = new Uint8Array(2 + bytes.length)
  buf[0] = ControlType.START_APP
  buf[1] = bytes.length
  buf.set(bytes, 2)
  return buf
}
