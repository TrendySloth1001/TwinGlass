// scrcpy 5.0.1 wire constants. Source of truth: docs/FACTS.md.

export const SCRCPY_VERSION = '5.0.1'
export const DEVICE_SERVER_PATH = '/data/local/tmp/scrcpy-server.jar'
export const DEVICE_NAME_FIELD_LENGTH = 64

export const CodecId = {
  H264: 0x68323634,
  H265: 0x68323635,
  AV1: 0x00617631,
  OPUS: 0x6f707573,
  AAC: 0x00616163,
  FLAC: 0x666c6163,
  RAW: 0x00726177,
  /** Stream disabled on the device side (e.g. audio on Android < 11). */
  DISABLED: 0,
  /** Server-side configuration error. */
  ERROR: 1,
} as const

export const ControlType = {
  INJECT_KEYCODE: 0,
  INJECT_TEXT: 1,
  INJECT_TOUCH_EVENT: 2,
  INJECT_SCROLL_EVENT: 3,
  BACK_OR_SCREEN_ON: 4,
  EXPAND_NOTIFICATION_PANEL: 5,
  EXPAND_SETTINGS_PANEL: 6,
  COLLAPSE_PANELS: 7,
  GET_CLIPBOARD: 8,
  SET_CLIPBOARD: 9,
  SET_DISPLAY_POWER: 10,
  ROTATE_DEVICE: 11,
  UHID_CREATE: 12,
  UHID_INPUT: 13,
  UHID_DESTROY: 14,
  OPEN_HARD_KEYBOARD_SETTINGS: 15,
  START_APP: 16,
  RESET_VIDEO: 17,
  CAMERA_SET_TORCH: 18,
  CAMERA_ZOOM_IN: 19,
  CAMERA_ZOOM_OUT: 20,
  RESIZE_DISPLAY: 21,
  SCAN_FILE: 22,
} as const

export const DeviceMessageType = {
  CLIPBOARD: 0,
  ACK_CLIPBOARD: 1,
  UHID_OUTPUT: 2,
} as const

export const CONTROL_MSG_MAX_SIZE = 1 << 18 // 256 KiB
export const INJECT_TEXT_MAX_LENGTH = 300
export const SET_CLIPBOARD_TEXT_MAX_LENGTH = CONTROL_MSG_MAX_SIZE - 14

/** android.view.KeyEvent actions */
export const KeyAction = { DOWN: 0, UP: 1 } as const

/** android.view.MotionEvent actions */
export const MotionAction = {
  DOWN: 0,
  UP: 1,
  MOVE: 2,
  CANCEL: 3,
  POINTER_DOWN: 5,
  POINTER_UP: 6,
  HOVER_MOVE: 7,
  HOVER_ENTER: 9,
  HOVER_EXIT: 10,
} as const

/** android.view.MotionEvent BUTTON_* */
export const MotionButton = {
  PRIMARY: 1,
  SECONDARY: 2,
  TERTIARY: 4,
  BACK: 8,
  FORWARD: 16,
} as const

/** Special pointer ids understood by the scrcpy server. */
export const PointerId = {
  MOUSE: -1n,
  GENERIC_FINGER: -2n,
  VIRTUAL_FINGER: -3n,
} as const

/** android.view.KeyEvent META_* */
export const MetaState = {
  SHIFT_ON: 0x1,
  ALT_ON: 0x2,
  CTRL_ON: 0x1000,
  META_ON: 0x10000,
  CAPS_LOCK_ON: 0x100000,
} as const

export const CopyKey = { NONE: 0, COPY: 1, CUT: 2 } as const
