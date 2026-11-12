import { ArrowUpRight, Download, FileCheck2, Lock, ScrollText } from 'lucide-react'
import { useEffect } from 'react'
import { Chip, FrameCorners } from '../components/base'
import { ConsentCheck, useDownload } from '../components/download'
import { anchor, formatDate, formatSize, REPO, useReleases, type Asset } from '../lib/releases'

function AssetRow({ a, agreed }: { a: Asset; agreed: boolean }) {
  const dmg = a.name.endsWith('.dmg')
  const Icon = dmg ? Download : FileCheck2
  const meta = [formatSize(a.size), a.downloads !== null ? `${a.downloads.toLocaleString('en')} downloads` : ''].filter(Boolean).join(' · ')
  return (
    <li className="flex flex-wrap items-center gap-3 border-t border-border py-3 first:border-t-0">
      <Icon className="size-4 shrink-0 text-mark" strokeWidth={1.7} />
      <span className="min-w-0 font-mono text-[13px] break-all text-heading">{a.name}</span>
      {meta && <span className="text-xs text-muted-foreground">{meta}</span>}
      {agreed ? (
        <a
          href={a.url}
          className={`ml-auto inline-flex h-8 items-center gap-1.5 rounded-[4px] px-3 text-sm font-medium ${dmg ? 'bg-heading text-background hover:opacity-85' : 'border border-input-border text-heading hover:bg-muted'}`}
        >
          {dmg ? 'Download' : 'Checksum'}
        </a>
      ) : (
        <span title="Agree to the privacy policy first" className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-[4px] border border-input-border px-3 text-sm text-muted-foreground">
          <Lock className="size-3.5" /> {dmg ? 'Download' : 'Checksum'}
        </span>
      )}
    </li>
  )
}

export function Releases() {
  const { releases, live } = useReleases()
  const { agreed } = useDownload()
  useEffect(() => {
    const id = window.location.hash.slice(1)
    if (id) setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }), 300)
  }, [live])
  return (
    <main className="mx-auto max-w-4xl px-4 pt-20 pb-10 sm:px-6">
      <p className="font-mono text-[11px] text-muted-foreground uppercase">Releases</p>
      <h1 className="font-soft mt-3 text-5xl sm:text-6xl">Downloads</h1>
      <p className="mt-4 text-lg">
        Every version of Twinglass for Mac, with its checksum. Each one carries the phone app, so there’s nothing separate to download for your phone. Installed
        copies update themselves.
      </p>

      <div className="relative mt-8 border border-input-border bg-input/60 p-4">
        <FrameCorners />
        <ConsentCheck id="consent-releases" />
        {!agreed && <p className="mt-2 pl-8 text-xs text-muted-foreground">Downloads unlock once you agree.</p>}
      </div>

      <ol className="mt-10 flex flex-col gap-6">
        {releases.map((r) => (
          <li key={r.version} id={anchor(r.version)} className="relative scroll-mt-24 border border-border bg-tile p-6 sm:p-8">
            <FrameCorners />
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-heading">v{r.version}</span>
              {r.latest && <Chip dot>Latest</Chip>}
              {r.phone && <Chip>phone app {r.phone}</Chip>}
              <span className="text-sm text-muted-foreground">· {formatDate(r.date)}</span>
            </div>
            <h2 className="font-soft mt-3 text-2xl">{r.title}</h2>
            {r.summary && <p className="mt-2 text-sm leading-relaxed">{r.summary}</p>}
            <ul className="mt-5 border border-input-border bg-background/60 px-4">
              {r.assets.map((a) => (
                <AssetRow key={a.name} a={a} agreed={agreed} />
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm">
              <a href={`/changelog#${anchor(r.version)}`} className="inline-flex items-center gap-1.5 text-mark hover:underline">
                <ScrollText className="size-3.5" /> What changed
              </a>
              <a href={r.page} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-heading">
                On GitHub <ArrowUpRight className="size-3.5" />
              </a>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-6 text-xs text-muted-foreground">
        {live ? 'Live from GitHub Releases.' : 'Showing the changelog’s versions; GitHub couldn’t be reached for sizes and download counts.'} Older builds:{' '}
        <a className="underline" href={`${REPO}/releases`} target="_blank" rel="noopener noreferrer">
          github.com/TrendySloth1001/TwinGlass/releases
        </a>
        .
      </p>
    </main>
  )
}
