import { useCallback, useState } from 'react'
import type { AudioMode } from '@shared/ipc'

const KEY = 'mob-mirror:settings'

export interface Settings {
  audio: AudioMode
}

const DEFAULTS: Settings = { audio: 'off' }

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
