import { useEffect, useRef } from 'react'

/**
 * Calls `fn` every `ms` while the window is visible; paused while it's hidden (minimized, covered,
 * on another Space), and called once right away when it shows again. For refreshes that only
 * matter to someone looking (battery on the home screen, recent captures, a clock).
 */
export function useVisibleInterval(fn: () => void, ms: number, enabled = true): void {
  const cb = useRef(fn)
  cb.current = fn
  useEffect(() => {
    if (!enabled) return
    let t = 0
    const start = (): void => {
      window.clearInterval(t)
      t = document.visibilityState === 'visible' ? window.setInterval(() => cb.current(), ms) : 0
    }
    const onVis = (): void => {
      if (document.visibilityState === 'visible') cb.current()
      start()
    }
    start()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.clearInterval(t)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [ms, enabled])
}
