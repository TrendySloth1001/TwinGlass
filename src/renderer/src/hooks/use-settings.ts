import { useCallback, useState } from 'react'
import type { AudioMode } from '@shared/ipc'
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
}

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
