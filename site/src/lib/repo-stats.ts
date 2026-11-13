// The repository's live star and fork counts from GitHub's public API (no token). The last answer
// shows at once; a fresh one is asked for on every page load and whenever the tab comes back into
// view, at most once a minute (GitHub allows 60 unauthenticated calls an hour, and its own answer
// can lag about a minute).
import { useEffect, useState } from 'react'

export interface RepoStats {
  stars: number
  forks: number
}

const KEY = 'twinglass:repo-stats'
const FRESH_MS = 60_000

function saved(): (RepoStats & { at: number }) | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as (RepoStats & { at: number }) | null
    return v && typeof v.stars === 'number' && typeof v.forks === 'number' && typeof v.at === 'number' ? v : null
  } catch {
    return null
  }
}

let inFlight: Promise<RepoStats | null> | null = null
function load(): Promise<RepoStats | null> {
  inFlight ??= fetch('https://api.github.com/repos/TrendySloth1001/TwinGlass', { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' })
    .then((r) => (r.ok ? (r.json() as Promise<{ stargazers_count: number; forks_count: number }>) : null))
    .then((r) => {
      if (!r) return null
      const s = { stars: r.stargazers_count, forks: r.forks_count }
      try {
        localStorage.setItem(KEY, JSON.stringify({ ...s, at: Date.now() }))
      } catch {
        /* private mode: fine */
      }
      return s
    })
    .catch(() => null)
    .finally(() => {
      inFlight = null
    })
  return inFlight
}

export function useRepoStats(): RepoStats | null {
  const [stats, setStats] = useState<RepoStats | null>(() => saved())
  useEffect(() => {
    let alive = true
    const refresh = (force: boolean): void => {
      const last = saved()
      if (!force && last && Date.now() - last.at < FRESH_MS) return
      void load().then((s) => alive && s && setStats(s))
    }
    refresh(true)
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') refresh(false)
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      alive = false
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [])
  return stats
}

/** 1234 → "1.2k". */
export const compact = (n: number): string => (n < 1000 ? String(n) : `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, '')}k`)
