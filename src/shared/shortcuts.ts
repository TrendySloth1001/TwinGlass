// Single source of truth for device actions and their keyboard shortcuts. The main process builds
// the "Device" menu from this (so shortcuts work even though the canvas has focus and Electron's menu
// sees keys first), and the renderer shows the same accelerators in toolbar tooltips.

export type DeviceAction =
  | 'back'
  | 'home'
  | 'recents'
  | 'notifications'
  | 'quickSettings'
  | 'power'
  | 'volumeUp'
  | 'volumeDown'
  | 'rotate'
  | 'screenOff'
  | 'screenshot'
  | 'record'
  | 'disconnect'

export interface ShortcutDef {
  action: DeviceAction
  label: string
  /** Electron accelerator syntax. */
  accelerator: string
  /** Menu section, for separators. */
  group: 'nav' | 'hardware' | 'panels' | 'capture' | 'session'
}

export const SHORTCUTS: ShortcutDef[] = [
  { action: 'back', label: 'Back', accelerator: 'CommandOrControl+B', group: 'nav' },
  { action: 'home', label: 'Home', accelerator: 'CommandOrControl+Shift+H', group: 'nav' },
  { action: 'recents', label: 'Recent Apps', accelerator: 'CommandOrControl+S', group: 'nav' },
  { action: 'notifications', label: 'Notifications', accelerator: 'CommandOrControl+N', group: 'panels' },
  { action: 'quickSettings', label: 'Quick Settings', accelerator: 'CommandOrControl+Shift+N', group: 'panels' },
  { action: 'volumeUp', label: 'Volume Up', accelerator: 'CommandOrControl+Up', group: 'hardware' },
  { action: 'volumeDown', label: 'Volume Down', accelerator: 'CommandOrControl+Down', group: 'hardware' },
  { action: 'power', label: 'Power', accelerator: 'CommandOrControl+P', group: 'hardware' },
  { action: 'rotate', label: 'Rotate', accelerator: 'CommandOrControl+R', group: 'hardware' },
  { action: 'screenOff', label: 'Phone Screen Off/On', accelerator: 'CommandOrControl+O', group: 'hardware' },
  { action: 'screenshot', label: 'Screenshot', accelerator: 'CommandOrControl+Shift+S', group: 'capture' },
  { action: 'record', label: 'Start/Stop Recording', accelerator: 'CommandOrControl+Shift+R', group: 'capture' },
  { action: 'disconnect', label: 'Disconnect', accelerator: 'CommandOrControl+D', group: 'session' },
]

const SYMBOLS: Record<string, string> = {
  CommandOrControl: '⌘',
  Command: '⌘',
  Shift: '⇧',
  Alt: '⌥',
  Option: '⌥',
  Control: '⌃',
  Up: '↑',
  Down: '↓',
  Left: '←',
  Right: '→',
}

/** "CommandOrControl+Shift+H" -> "⇧⌘H" (macOS modifier order: ⌃⌥⇧⌘). */
export function acceleratorLabel(accel: string): string {
  const parts = accel.split('+')
  const key = parts.pop()!
  const order = ['Control', 'Alt', 'Option', 'Shift', 'CommandOrControl', 'Command']
  const mods = parts.sort((a, b) => order.indexOf(a) - order.indexOf(b)).map((m) => SYMBOLS[m] ?? m)
  return mods.join('') + (SYMBOLS[key] ?? key.toUpperCase())
}

export function shortcutFor(action: DeviceAction): string {
  const s = SHORTCUTS.find((x) => x.action === action)
  return s ? acceleratorLabel(s.accelerator) : ''
}
