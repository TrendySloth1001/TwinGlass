import { useSyncExternalStore } from 'react'

export type ThemePref = 'system' | 'light' | 'dark'

const mq = window.matchMedia('(prefers-color-scheme: dark)')
let pref: ThemePref = 'system'

const listeners = new Set<() => void>()
export const resolvedTheme = (): 'light' | 'dark' => (pref === 'dark' || (pref === 'system' && mq.matches) ? 'dark' : 'light')

function apply(): void {
  document.documentElement.classList.toggle('dark', resolvedTheme() === 'dark')
  for (const l of listeners) l()
}

/** The theme actually shown (System resolved), for components that need it as a value. */
export function useResolvedTheme(): 'light' | 'dark' {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    resolvedTheme,
  )
}
mq.addEventListener('change', apply)

/** Applies the appearance to the page (<html class="dark">) and to native UI (traffic lights, menus). */
export function applyTheme(next: ThemePref): void {
  pref = next
  apply()
  window.mobMirror.setTheme(next).catch(() => {}) // older main during a dev hot update: page theme still applies
}

/** Before the first render: the saved preference, so the window never flashes the wrong theme. */
export function initTheme(): void {
  try {
    const saved = (JSON.parse(localStorage.getItem('mob-mirror:settings') ?? '{}') as { theme?: ThemePref }).theme
    pref = saved === 'light' || saved === 'dark' ? saved : 'system'
  } catch {
    pref = 'system'
  }
  apply()
}
