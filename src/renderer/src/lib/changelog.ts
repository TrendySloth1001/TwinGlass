// The release notes both apps show (changelog/changelog.json, also rendered to CHANGELOG.md).
import data from '../../../../changelog/changelog.json'

export interface Release {
  version: string
  date: string
  /** Phone app version shipped with this Mac release. */
  phone: string
  title: string
  summary: string
  mac: string[]
  phoneApp: string[]
}

export const RELEASES: Release[] = data.releases

export function formatReleaseDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
}
