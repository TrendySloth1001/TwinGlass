// DOM KeyboardEvent.code -> android.view.KeyEvent KEYCODE_* values.
import { MetaState } from '../scrcpy/constants'

export const AndroidKey = {
  HOME: 3,
  BACK: 4,
  POWER: 26,
  VOLUME_UP: 24,
  VOLUME_DOWN: 25,
  MENU: 82,
  APP_SWITCH: 187,
} as const

const map: Record<string, number> = {
  Digit0: 7, Digit1: 8, Digit2: 9, Digit3: 10, Digit4: 11,
  Digit5: 12, Digit6: 13, Digit7: 14, Digit8: 15, Digit9: 16,
  ArrowUp: 19, ArrowDown: 20, ArrowLeft: 21, ArrowRight: 22,
  Comma: 55, Period: 56,
  AltLeft: 57, AltRight: 58, ShiftLeft: 59, ShiftRight: 60,
  Tab: 61, Space: 62, Enter: 66, NumpadEnter: 160, Backspace: 67, Backquote: 68,
  Minus: 69, Equal: 70, BracketLeft: 71, BracketRight: 72, Backslash: 73,
  Semicolon: 74, Quote: 75, Slash: 76,
  PageUp: 92, PageDown: 93, Escape: 111, Delete: 112,
  ControlLeft: 113, ControlRight: 114, CapsLock: 115,
  MetaLeft: 117, MetaRight: 118, Home: 122, End: 123, Insert: 124,
  F1: 131, F2: 132, F3: 133, F4: 134, F5: 135, F6: 136,
  F7: 137, F8: 138, F9: 139, F10: 140, F11: 141, F12: 142,
}
// KeyA..KeyZ -> 29..54
for (let i = 0; i < 26; i++) map[`Key${String.fromCharCode(65 + i)}`] = 29 + i

export function domCodeToKeycode(code: string): number | undefined {
  return map[code]
}

export function metaStateOf(e: { shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean }): number {
  return (
    (e.shiftKey ? MetaState.SHIFT_ON : 0) |
    (e.altKey ? MetaState.ALT_ON : 0) |
    (e.ctrlKey ? MetaState.CTRL_ON : 0) |
    (e.metaKey ? MetaState.META_ON : 0)
  )
}
