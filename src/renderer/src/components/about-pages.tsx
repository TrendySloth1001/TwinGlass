// Settings → About and Settings → What's new.
import { Bug, ExternalLink, RefreshCw, ScrollText, Sparkles, Tag } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import type { AboutInfo, AboutLink, UpdateInfo } from '../../../preload/api'
import icon from '@/assets/twinglass-icon.png'
import { Button } from '@/components/ui/button'
import { Group, Row } from '@/components/settings-parts'
import { SectionHeader } from '@/components/section-header'
import { formatReleaseDate, RELEASES } from '@/lib/changelog'
import { startUpdate } from '@/lib/update'

/** GitHub's mark (Lucide no longer ships brand icons). */
function GithubMark(): ReactNode {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  )
}

const open = (which: AboutLink): void => void window.mobMirror.openAboutLink(which)

/** Click to copy (version lines for bug reports). */
function Value({ children }: { children: string }): ReactNode {
  return (
    <button
      type="button"
      className="font-mono text-xs text-muted-foreground tabular-nums hover:text-foreground"
      title="Copy"
      onClick={() => void navigator.clipboard.writeText(children).then(() => toast.success('Copied'))}
    >
      {children}
    </button>
  )
}

const CREDITS: { name: string; what: string; license: string }[] = [
  { name: 'scrcpy', what: 'Genymobile’s server, pushed to the phone in Developer mode', license: 'Apache-2.0' },
  { name: 'Electron', what: 'App shell', license: 'MIT' },
  { name: 'React', what: 'Interface', license: 'MIT' },
  { name: 'shadcn/ui, Radix UI', what: 'Components', license: 'MIT' },
  { name: 'Tailwind CSS', what: 'Styling', license: 'MIT' },
  { name: 'Lucide', what: 'Icons', license: 'ISC' },
  { name: 'Space Grotesk, Space Mono, Doto', what: 'Typefaces', license: 'SIL OFL 1.1' },
  { name: 'Model Context Protocol SDK', what: 'Agent server', license: 'MIT' },
]

export function AboutPage({ onWhatsNew }: { onWhatsNew: () => void }): ReactNode {
  const [info, setInfo] = useState<AboutInfo | null>(null)
  const [update, setUpdate] = useState<UpdateInfo | null>(null)
  const [checking, setChecking] = useState(false)
  useEffect(() => void window.mobMirror.aboutInfo().then(setInfo, () => {}), [])
  const latest = RELEASES[0]

  const check = (): void => {
    setChecking(true)
    void window.mobMirror
      .checkForUpdate()
      .then(setUpdate, () => {})
      .finally(() => setChecking(false))
  }

  const copyAll = (): void => {
    if (!info) return
    const lines = [
      `Twinglass ${info.version}`,
      `Phone app (bundled) ${info.phoneApp ?? '—'}`,
      `macOS ${info.macos} (${info.arch})`,
      `Electron ${info.electron} · Chromium ${info.chrome} · Node ${info.node}`,
      `scrcpy-server ${info.scrcpy}`,
    ]
    void navigator.clipboard.writeText(lines.join('\n')).then(() => toast.success('Version details copied'))
  }

  return (
    <>
      {/* Identity */}
      <section className="mb-6 flex items-center gap-5 rounded-[4px] border bg-card p-5">
        <img src={icon} alt="" className="size-20 shrink-0 rounded-[22%] shadow-sm" draggable={false} />
        <div className="min-w-0 flex-1">
          <div className="text-xl font-semibold tracking-tight">Twinglass</div>
          <div className="mt-0.5 text-[13px] text-muted-foreground">Your Android phone, on your Mac.</div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="rounded-full border px-2 py-0.5 font-medium tabular-nums">Version {info?.version ?? '…'}</span>
            {latest && latest.version === info?.version && <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{latest.title}</span>}
            {info && !info.packaged && <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">Development build</span>}
          </div>
        </div>
      </section>

      <div className="mb-6 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => open('repo')}>
          <GithubMark /> GitHub
        </Button>
        <Button size="sm" variant="outline" onClick={onWhatsNew}>
          <Sparkles /> What’s new
        </Button>
        <Button size="sm" variant="outline" onClick={() => open('new-issue')}>
          <Bug /> Report a problem
        </Button>
        <Button size="sm" variant="outline" onClick={() => open('releases')}>
          <Tag /> All releases
        </Button>
      </div>

      <Group title="Updates">
        <Row
          label={update?.available ? `Twinglass ${update.latest} is available` : 'Twinglass is checked for updates automatically'}
          hint={
            update?.error
              ? `Couldn’t check: ${update.error}`
              : update && !update.available
                ? 'You’re on the latest version.'
                : update?.available
                  ? update.canInstall
                    ? 'Installs in place in a few seconds; Twinglass reopens.'
                    : 'Twinglass can’t replace itself in this folder, so this opens the download.'
                  : 'Shortly after launch and every 6 hours. The phone app updates from this Mac.'
          }
        >
          {update?.available ? (
            <Button size="sm" onClick={() => startUpdate(update)}>
              {update.canInstall ? 'Update now' : 'Download'}
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={check} disabled={checking}>
              <RefreshCw className={checking ? 'animate-spin' : undefined} /> Check now
            </Button>
          )}
        </Row>
      </Group>

      <Group title="This version">
        <Row label="Twinglass for Mac">{info ? <Value>{info.version}</Value> : null}</Row>
        <Row label="Phone app it carries" hint="Offered to connected phones that run an older one.">
          {info ? <Value>{info.phoneApp ?? 'not built'}</Value> : null}
        </Row>
        <Row label="scrcpy-server" hint="Pushed to the phone in Developer mode; SHA-256 checked.">
          {info ? <Value>{info.scrcpy}</Value> : null}
        </Row>
        <Row label="Runtime">{info ? <Value>{`Electron ${info.electron} · Chromium ${info.chrome.split('.')[0]} · Node ${info.node}`}</Value> : null}</Row>
        <Row label="This Mac">{info ? <Value>{`macOS ${info.macos} · ${info.arch === 'arm64' ? 'Apple Silicon' : info.arch}`}</Value> : null}</Row>
        <Row label="Copy version details" hint="Handy for a bug report.">
          <Button size="sm" variant="outline" onClick={copyAll} disabled={!info}>
            Copy
          </Button>
        </Row>
      </Group>

      <Group title="Privacy">
        <div className="py-3 text-[13px] leading-relaxed text-muted-foreground">
          Twinglass has no accounts, no analytics and no telemetry. Your phone’s screen, input, clipboard and files travel only between your phone and
          this Mac: over USB, adb on your network, or the encrypted Wi-Fi link (AES-256-GCM). The only internet request is the update check against
          GitHub Releases. Agent access is off by default and stays on this Mac.
        </div>
      </Group>

      <Group title="Project">
        <Row label="Source code" hint="github.com/TrendySloth1001/TwinGlass">
          <Button size="sm" variant="ghost" onClick={() => open('repo')}>
            Open <ExternalLink />
          </Button>
        </Row>
        <Row label="Issues and ideas" hint="Bug reports and feature requests on GitHub.">
          <Button size="sm" variant="ghost" onClick={() => open('issues')}>
            Open <ExternalLink />
          </Button>
        </Row>
        <Row label="Changelog" hint="Every release of both apps.">
          <Button size="sm" variant="ghost" onClick={() => open('changelog')}>
            Open <ExternalLink />
          </Button>
        </Row>
      </Group>

      <Group title="Built with">
        {CREDITS.map((c) => (
          <Row key={c.name} label={c.name} hint={c.what}>
            <span className="text-xs text-muted-foreground">{c.license}</span>
          </Row>
        ))}
      </Group>

      <p className="pb-2 text-center text-xs text-muted-foreground">
        © 2026 Nikhil Kumawat · Twinglass is not affiliated with Google or Genymobile. Android is a trademark of Google LLC.
      </p>
    </>
  )
}

export function ChangelogPage(): ReactNode {
  const [current, setCurrent] = useState<string | null>(null)
  useEffect(() => void window.mobMirror.aboutInfo().then((i) => setCurrent(i.version), () => {}), [])
  return (
    <>
      <p className="mb-5 text-[13px] text-muted-foreground">
        Twinglass for Mac and the phone app ship together: each release carries the phone app listed with it, and offers it to your phones.
      </p>
      <ol className="relative space-y-6 border-l pl-6">
        {RELEASES.map((r) => (
          <li key={r.version} className="relative">
            <span
              className={`absolute top-1.5 -left-[29px] size-2.5 rounded-full border-2 border-background ${r.version === current ? 'bg-primary' : 'bg-muted-foreground/40'}`}
            />
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <h3 className="text-[15px] font-semibold tabular-nums">{r.version}</h3>
              <span className="text-[13px] font-medium">{r.title}</span>
              {r.version === current && <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] text-primary-foreground">Installed</span>}
              <span className="ml-auto text-xs text-muted-foreground">{formatReleaseDate(r.date)}</span>
            </div>
            <p className="mt-1 text-[13px] text-muted-foreground">{r.summary}</p>
            <SectionHeader className="mt-3 mb-1.5">Mac</SectionHeader>
            <ul className="list-disc space-y-1 pl-4 text-[13px] leading-snug marker:text-muted-foreground">
              {r.mac.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            <SectionHeader className="mt-3 mb-1.5">Phone app {r.phone}</SectionHeader>
            <ul className="list-disc space-y-1 pl-4 text-[13px] leading-snug marker:text-muted-foreground">
              {r.phoneApp.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      <div className="mt-6 flex justify-center">
        <Button size="sm" variant="outline" onClick={() => open('releases')}>
          <ScrollText /> Releases on GitHub
        </Button>
      </div>
    </>
  )
}
