import { useCallback, useEffect, useState } from 'react'
import type { AudioMode } from '@shared/ipc'
import type { ThemePref } from '@/hooks/use-theme'
import type { PopupPref } from '@/lib/notify'
import { QUALITY_LABELS, type CodecPreference, type Quality } from '@shared/quality'
import type { FrameColor, FrameStyle } from '@/lib/phone-frames'

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
  /** Phone frame drawn around the mirror, and its finish. */
  frame: FrameStyle
  frameColor: FrameColor
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
  frame: 'none',
  frameColor: 'black',
}

export const DEFAULT_SETTINGS = DEFAULTS
/** Settings that need a new video/audio stream: changing them restarts a live mirror (~1 s). */
export const STREAM_KEYS = ['audio', 'quality', 'codec', 'maxFps', 'stayAwake', 'clipboardSync'] as const

/** Allowed values for the enum-like settings. Anything else (old version, hand edit) -> default. */
const ALLOWED: Partial<Record<keyof Settings, readonly unknown[]>> = {
  audio: ['off', 'mac', 'both'],
  quality: Object.keys(QUALITY_LABELS),
  codec: ['auto', 'h264', 'h265'],
  sidebarLayout: ['docked', 'floating'],
  viewMode: ['compact', 'full'],
  theme: ['system', 'light', 'dark'],
  popups: ['all', 'errors', 'off'],
  maxFps: [0, 30, 60, 90, 120],
  scrollSpeed: [0.5, 1, 1.5, 2.5],
  frame: ['none', 'modern', 'minimal', 'classic'],
  frameColor: ['black', 'graphite', 'silver', 'white', 'sand', 'blue', 'green'],
}

/**
 * Validates stored settings field by field: wrong type or unknown value -> that field's default,
 * unknown keys dropped. A corrupt or older settings blob can never put the UI in an impossible state.
 */
export function sanitizeSettings(raw: unknown): Settings {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const out: Record<string, unknown> = { ...DEFAULTS }
  for (const k of Object.keys(DEFAULTS) as (keyof Settings)[]) {
    const v = src[k]
    if (v === undefined) continue
    if (k === 'lastDevice') {
      if (v === null || typeof v === 'string') out[k] = v
    } else if (k === 'closedSections') {
      if (Array.isArray(v) && v.every((x) => typeof x === 'string')) out[k] = v
    } else if (typeof v === typeof DEFAULTS[k] && (!ALLOWED[k] || ALLOWED[k]!.includes(v))) {
      out[k] = v
    }
  }
  return out as unknown as Settings
}

function parse(json: string | null): Settings {
  try {
    return sanitizeSettings(JSON.parse(json ?? '{}'))
  } catch {
    return DEFAULTS
  }
}

function load(): Settings {
  try {
    return parse(localStorage.getItem(KEY))
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
  // Other windows ("Mirror in new window") change settings too: stay in sync.
  useEffect(() => {
    const onStorage = (e: StorageEvent): void => {
      if (e.key === KEY) setSettings(parse(e.newValue))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])
  return [settings, update]
}
