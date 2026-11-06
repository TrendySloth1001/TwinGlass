import { useCallback, useState } from 'react'
import type { AudioMode } from '@shared/ipc'
import type { ThemePref } from '@/hooks/use-theme'
import type { PopupPref } from '@/lib/notify'
import type { CodecPreference, Quality } from '@shared/quality'

const KEY = 'mob-mirror:settings'

export interface Settings {
  audio: AudioMode
  /** Phone draws a dot where each touch lands (useful to check precision). */
  showTouches: boolean
  quality: Quality
  codec: CodecPreference
  /** docked: beside the mirror; floating: glass panel over the mirror (takes no space). */
  sidebarLayout: 'docked' | 'floating'
  sidebarOpen: boolean
  /** Collapsed sidebar sections. */
  closedSections: string[]
  /** compact: phone-shaped mirror window with a control rail (default); full: manager layout. */
  viewMode: 'compact' | 'full'
  /** Hardware id (ro.serialno) of the phone mirrored last: preselected and auto-connected. */
  lastDevice: string | null
  /** Start mirroring by itself when the last phone (or the only phone) shows up. */
  autoConnect: boolean
  /** Appearance: follow macOS, or force light / dark. */
  theme: ThemePref
  /** Back / Home / Recents bar under the phone in the compact view. */
  navBar: boolean
  /** Keep the mirror window above other windows. */
  alwaysOnTop: boolean
  /** Frame-rate cap; 0 = no cap. */
  maxFps: number
  /** Keep the phone awake while mirroring (while plugged in). */
  stayAwake: boolean
  /** Turn the phone's own screen off when mirroring starts (the mirror keeps working). */
  screenOffOnStart: boolean
  /** Right-click = Back, middle-click = Home, … */
  mouseShortcuts: boolean
  invertScroll: boolean
  scrollSpeed: number
  /** Copy the phone clipboard to the Mac automatically. */
  clipboardSync: boolean
  /** Reconnect by itself after the link drops (Wi-Fi, cable). */
  autoReconnect: boolean
  /** Which notices also pop up as toasts (all are kept in the notification center). */
  popups: PopupPref
  /** Stats strip under the mirror in the full view. */
  showStatusBar: boolean
  /** Ask for Touch ID before typing the saved PIN (off: typed directly). */
  requireTouchId: boolean
}

const DEFAULTS: Settings = {
  audio: 'off',
  showTouches: false,
  quality: 'auto',
  codec: 'auto',
  sidebarLayout: 'docked',
  sidebarOpen: true,
  closedSections: ['agents'],
  viewMode: 'compact',
  lastDevice: null,
  autoConnect: true,
  theme: 'system',
  navBar: false,
  alwaysOnTop: false,
  maxFps: 0,
  stayAwake: true,
  screenOffOnStart: false,
  mouseShortcuts: true,
  invertScroll: false,
  scrollSpeed: 1,
  clipboardSync: true,
  autoReconnect: true,
  popups: 'all',
  showStatusBar: true,
  requireTouchId: false,
}

export const DEFAULT_SETTINGS = DEFAULTS
/** Settings that need a new video/audio stream: changing them restarts a live mirror (~1 s). */
export const STREAM_KEYS = ['audio', 'quality', 'codec', 'maxFps', 'stayAwake', 'clipboardSync'] as const

function load(): Settings {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>) }
  } catch {
    return DEFAULTS
  }
}

export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const [settings, setSettings] = useState(load)
  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => {
      const next = { ...s, ...patch }
      try {
        localStorage.setItem(KEY, JSON.stringify(next))
      } catch {
        // storage unavailable: keep the in-memory value
      }
      return next
    })
  }, [])
  return [settings, update]
}
