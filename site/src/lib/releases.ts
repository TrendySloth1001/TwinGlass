// One source for both pages: the changelog (changelog/changelog.json, the same file both apps show,
// copied in by `npm run sync`) joined with GitHub's releases (assets, sizes, download counts).
// If GitHub can't be reached, the releases page is built from the changelog alone.
import { useEffect, useState } from 'react'
import changelog from '../data/changelog.json'
import release from '../data/release.json'
import { RELEASES } from '../components/base'

export type Entry = (typeof changelog.releases)[number]
export const ENTRIES: Entry[] = RELEASES
export const REPO = release.repo
export const anchor = (version: string) => `v${version}`

export interface Asset {
  name: string
  url: string
  size: number | null
  downloads: number | null
}

export interface Release {
  version: string
  date: string
  title: string
  summary: string
  phone: string | null
  page: string
  assets: Asset[]
  latest: boolean
}

type GhRelease = {
  tag_name: string
  name: string
  published_at: string
  html_url: string
  draft: boolean
  prerelease: boolean
  assets: { name: string; size: number; download_count: number; browser_download_url: string }[]
}

function fromChangelog(): Release[] {
  return ENTRIES.map((e, k) => ({
    version: e.version,
    date: e.date,
    title: e.title,
    summary: e.summary,
    phone: e.phone,
    page: `${REPO}/releases/tag/v${e.version}`,
    assets: [
      { name: `Twinglass-${e.version}-arm64.dmg`, url: `${REPO}/releases/download/v${e.version}/Twinglass-${e.version}-arm64.dmg`, size: null, downloads: null },
      { name: `Twinglass-${e.version}-arm64.dmg.sha256`, url: `${REPO}/releases/download/v${e.version}/Twinglass-${e.version}-arm64.dmg.sha256`, size: null, downloads: null },
    ],
    latest: k === 0,
  }))
}

export function useReleases(): { releases: Release[]; live: boolean } {
  const [state, setState] = useState<{ releases: Release[]; live: boolean }>({ releases: fromChangelog(), live: false })
  useEffect(() => {
    fetch('https://api.github.com/repos/TrendySloth1001/TwinGlass/releases?per_page=30', { headers: { Accept: 'application/vnd.github+json' } })
      .then((r) => (r.ok ? (r.json() as Promise<GhRelease[]>) : null))
      .then((list) => {
        if (!list?.length) return
        const shown = list.filter((r) => !r.draft && !r.prerelease)
        const releases = shown.map((r, k): Release => {
          const version = r.tag_name.replace(/^v/, '')
          const e = ENTRIES.find((x) => x.version === version)
          return {
            version,
            date: (r.published_at ?? '').slice(0, 10) || e?.date || '',
            title: e?.title ?? r.name ?? r.tag_name,
            summary: e?.summary ?? '',
            phone: e?.phone ?? null,
            page: r.html_url,
            assets: r.assets.map((a) => ({ name: a.name, url: a.browser_download_url, size: a.size, downloads: a.download_count })),
            latest: k === 0,
          }
        })
        setState({ releases, live: true })
      })
      .catch(() => {})
  }, [])
  return state
}

export function formatDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function formatSize(bytes: number | null): string {
  if (bytes === null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
