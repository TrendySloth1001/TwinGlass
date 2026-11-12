import { ArrowUpRight, Laptop, Package, Smartphone } from 'lucide-react'
import { useEffect } from 'react'
import { Chip, FrameCorners } from '../components/base'
import { anchor, ENTRIES, formatDate, REPO } from '../lib/releases'

export function Changelog() {
  // Land on the version in the URL (#v0.1.2) once the page has rendered.
  useEffect(() => {
    const id = window.location.hash.slice(1)
    if (id) setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }), 60)
  }, [])
  return (
    <main className="mx-auto max-w-6xl px-4 pt-32 pb-10 sm:px-6 lg:px-10">
      <p className="font-mono text-[11px] text-muted-foreground uppercase">Changelog</p>
      <h1 className="font-soft mt-3 text-5xl sm:text-6xl">What’s new in Twinglass</h1>
      <p className="mt-4 max-w-2xl text-lg">
        Twinglass for Mac and the phone app ship together: every release carries the phone app listed with it, and offers it to your phones. The same notes
        appear in both apps under Settings → What’s new.
      </p>
      <div className="mt-6 flex flex-wrap gap-2 text-sm">
        <a href="/releases" className="inline-flex items-center gap-1.5 border border-input-border bg-input px-3 py-1.5 text-heading hover:bg-muted">
          <Package className="size-4 text-mark" /> Downloads for every release
        </a>
        <a href={`${REPO}/blob/master/CHANGELOG.md`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 border border-input-border px-3 py-1.5 hover:text-heading">
          CHANGELOG.md on GitHub <ArrowUpRight className="size-3.5" />
        </a>
      </div>

      <div className="mt-14 grid gap-10 lg:grid-cols-[13rem_1fr]">
        <nav aria-label="Versions" className="hidden lg:block">
          <ol className="sticky top-24 flex flex-col gap-1 border-l border-border">
            {ENTRIES.map((e, k) => (
              <li key={e.version}>
                <a href={`#${anchor(e.version)}`} className="-ml-px flex items-baseline gap-2 border-l border-transparent py-1.5 pl-4 text-sm hover:border-mark hover:text-heading">
                  <span className="font-mono text-heading">{e.version}</span>
                  {k === 0 && <span className="text-[11px] text-mark">latest</span>}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <ol className="flex flex-col gap-6">
          {ENTRIES.map((e, k) => (
            <li key={e.version} id={anchor(e.version)} className="relative scroll-mt-24 border border-border bg-tile p-7 sm:p-9">
              <FrameCorners />
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm text-heading">v{e.version}</span>
                {k === 0 && <Chip dot>Latest</Chip>}
                <span className="text-sm text-muted-foreground">· {formatDate(e.date)}</span>
                <a href={`/releases#${anchor(e.version)}`} className="ml-auto inline-flex items-center gap-1 text-sm text-mark hover:underline">
                  Download this release <ArrowUpRight className="size-3.5" />
                </a>
              </div>
              <h2 className="font-soft mt-4 text-3xl">{e.title}</h2>
              <p className="mt-2 max-w-3xl">{e.summary}</p>
              <div className="mt-8 grid gap-8 md:grid-cols-2">
                {(
                  [
                    [Laptop, `Twinglass for Mac ${e.version}`, e.mac],
                    [Smartphone, `Phone app ${e.phone}`, e.phoneApp],
                  ] as const
                ).map(([I, t, lines]) => (
                  <div key={t}>
                    <p className="flex items-center gap-2 text-sm font-medium text-heading">
                      <I className="size-4 text-mark" strokeWidth={1.7} /> {t}
                    </p>
                    <ul className="mt-3 flex flex-col gap-2.5 text-sm leading-relaxed">
                      {lines.map((l) => (
                        <li key={l} className="flex gap-2.5">
                          <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-mark" />
                          <span>{l}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </main>
  )
}
