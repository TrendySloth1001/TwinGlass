// The repository's live star and fork counts from GitHub's public API (no token). Kept for the
// session so moving between pages doesn't ask again (GitHub allows 60 unauthenticated calls an hour).
import { useEffect, useState } from 'react'

export interface RepoStats {
  stars: number
  forks: number
}

const KEY = 'twinglass:repo-stats'
let inFlight: Promise<RepoStats | null> | null = null

function cached(): RepoStats | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as RepoStats | null
    return v && typeof v.stars === 'number' && typeof v.forks === 'number' ? v : null
  } catch {
    return null
  }
}

function load(): Promise<RepoStats | null> {
  inFlight ??= fetch('https://api.github.com/repos/TrendySloth1001/TwinGlass', { headers: { Accept: 'application/vnd.github+json' } })
    .then((r) => (r.ok ? (r.json() as Promise<{ stargazers_count: number; forks_count: number }>) : null))
    .then((r) => {
      if (!r) return null
      const s = { stars: r.stargazers_count, forks: r.forks_count }
      try {
        sessionStorage.setItem(KEY, JSON.stringify(s))
      } catch {
        /* private mode: fine */
      }
      return s
    })
    .catch(() => null)
  return inFlight
}

export function useRepoStats(): RepoStats | null {
  const [stats, setStats] = useState<RepoStats | null>(cached)
  useEffect(() => {
    if (stats) return
    let alive = true
    void load().then((s) => alive && s && setStats(s))
    return () => {
      alive = false
    }
  }, [stats])
  return stats
}

/** 1234 → "1.2k". */
export const compact = (n: number): string => (n < 1000 ? String(n) : `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, '')}k`)
