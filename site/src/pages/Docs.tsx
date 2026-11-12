// The documentation: one long page to read top to bottom, in the site's design language (inline
// icon / logo chips, L7 frames), with diagrams built from real icons and logos. Facts come from the
// app's own code and docs (shortcuts from src/shared/shortcuts.ts, agent tools from docs/AGENTS.md).
import {
  AlertTriangle,
  AppWindow,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Bot,
  Cable,
  Check,
  ClipboardCopy,
  Cloud,
  CloudOff,
  Code2,
  Command,
  Copy,
  Cpu,
  Download,
  Eye,
  FileDown,
  Film,
  Fingerprint,
  FolderOpen,
  Hammer,
  Info,
  Laptop,
  Layers,
  Lightbulb,
  Link2,
  Lock,
  Monitor,
  MonitorSmartphone,
  MousePointerClick,
  Package,
  Plug,
  QrCode,
  RefreshCw,
  ScreenShare,
  Server,
  ShieldCheck,
  Smartphone,
  SquareTerminal,
  Terminal,
  Usb,
  Wifi,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import '@fontsource-variable/fraunces/full.css'
import '@fontsource-variable/source-serif-4/opsz.css'
import '@fontsource-variable/source-serif-4/opsz-italic.css'
import { useEffect, useState, type ReactNode } from 'react'
import { siAndroid, siApple, siClaude, siCursor, siGithub, siHomebrew, siJetpackcompose, siKotlin, type SimpleIcon } from 'simple-icons'
import { FrameCorners, REPO, Tag } from '../components/base'
import { useDownload } from '../components/download'

const INSTALL = 'curl -fsSL https://raw.githubusercontent.com/TrendySloth1001/TwinGlass/master/install.sh | bash'

// ---------------------------------------------------------------- building blocks

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="mx-px inline-flex min-w-[1.6em] items-center justify-center rounded-[4px] border border-b-2 border-input-border bg-input px-1.5 py-px font-mono text-[0.82em] leading-tight whitespace-nowrap text-heading">
      {children}
    </kbd>
  )
}

/** An MCP tool, a file or a setting name inside prose. */
function Code({ children }: { children: string }) {
  return <code className="mx-px rounded-[3px] border border-primary/30 bg-primary/10 px-[0.35em] py-[0.05em] font-mono text-[0.84em] whitespace-nowrap text-mark">{children}</code>
}

function Logo({ logo, className = 'size-4' }: { logo: SimpleIcon; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d={logo.path} />
    </svg>
  )
}

function Callout({ kind = 'note', title, children }: { kind?: 'note' | 'tip' | 'warn'; title: string; children: ReactNode }) {
  const [Icon, tone] = kind === 'tip' ? [Lightbulb, 'border-ok/40 bg-ok/[0.07] text-ok'] : kind === 'warn' ? [AlertTriangle, 'border-amber-500/40 bg-amber-500/[0.07] text-amber-500'] : [Info, 'border-primary/40 bg-primary/[0.07] text-mark']
  return (
    <div className={`relative my-6 flex gap-3 border p-4 ${tone}`}>
      <Icon className="mt-0.5 size-[18px] shrink-0" strokeWidth={1.8} />
      <div className="min-w-0 text-sm leading-relaxed text-foreground">
        <p className="font-medium text-heading">{title}</p>
        <div className="mt-1">{children}</div>
      </div>
    </div>
  )
}

function CodeBlock({ lines, label }: { lines: string[]; label?: string }) {
  const [done, setDone] = useState(false)
  return (
    <div className="relative my-5 border border-term-border bg-term text-term-fg">
      <FrameCorners />
      <div className="flex items-center justify-between border-b border-term-border px-3 py-2 font-mono text-[11px] text-term-fg/55">
        <span className="flex items-center gap-1.5">
          <SquareTerminal className="size-3.5" /> {label ?? 'Terminal'}
        </span>
        <button
          type="button"
          onClick={() =>
            void navigator.clipboard.writeText(lines.join('\n')).then(() => {
              setDone(true)
              setTimeout(() => setDone(false), 1400)
            })
          }
          className="flex items-center gap-1 rounded-[3px] px-1.5 py-0.5 hover:bg-white/10"
        >
          {done ? <Check className="size-3.5 text-ok" /> : <Copy className="size-3.5" />}
          {done ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[12.5px] leading-relaxed">
        {lines.map((l) => (
          <span key={l} className="block">
            {l.startsWith('#') ? <span className="text-term-fg/45">{l}</span> : l}
          </span>
        ))}
      </pre>
    </div>
  )
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="relative my-6 overflow-x-auto border border-border">
      <FrameCorners />
      <table className="w-full text-left text-sm">
        <thead className="bg-tile">
          <tr>
            {head.map((h) => (
              <th key={h} className="border-b border-border px-4 py-2.5 font-mono text-[11px] font-normal tracking-wide text-muted-foreground uppercase">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, k) => (
            <tr key={k} className="border-b border-border last:border-0">
              {r.map((c, j) => (
                <td key={j} className={`px-4 py-2.5 align-top leading-relaxed ${j === 0 ? 'text-heading' : ''}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** A step in a flow diagram: an icon or logo in an L7 box, a name, a short line. */
type Node = { icon?: LucideIcon; logo?: SimpleIcon; title: string; sub: string; tone?: 'brand' | 'plain' }

function NodeBox({ n }: { n: Node }) {
  return (
    <div className="relative flex min-w-0 flex-1 flex-col items-center border border-input-border bg-background px-3 py-4 text-center">
      <FrameCorners />
      <span className={`flex size-10 items-center justify-center border ${n.tone === 'brand' ? 'border-primary/50 bg-primary/15 text-mark' : 'border-input-border bg-input text-heading'}`}>
        {n.logo ? <Logo logo={n.logo} className="size-5" /> : n.icon ? <n.icon className="size-5" strokeWidth={1.6} /> : null}
      </span>
      <p className="mt-2.5 text-[13px] font-medium text-heading">{n.title}</p>
      <p className="mt-0.5 font-mono text-[10.5px] leading-snug text-muted-foreground">{n.sub}</p>
    </div>
  )
}

/** A left-to-right pipeline (top to bottom on phones), with labels on the links. */
function Flow({ title, nodes, links }: { title: string; nodes: Node[]; links: string[] }) {
  return (
    <figure className="relative my-8 border border-border bg-tile p-4 sm:p-6">
      <FrameCorners />
      <figcaption className="mb-4 font-mono text-[11px] text-muted-foreground uppercase">{title}</figcaption>
      <div className="flex flex-col items-stretch gap-2 md:flex-row md:items-center">
        {nodes.map((n, k) => (
          <div key={n.title} className="contents">
            <NodeBox n={n} />
            {k < nodes.length - 1 && (
              <div className="flex shrink-0 flex-row items-center justify-center gap-2 py-1 md:w-28 md:flex-col md:gap-1 md:py-0">
                <ArrowDown className="size-4 text-mark md:hidden" />
                <ArrowRight className="hidden size-4 text-mark md:block" />
                <span className="text-center font-mono text-[10px] leading-tight text-muted-foreground">{links[k]}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </figure>
  )
}

/** Messages between two parties, in order. */
function Sequence({ title, left, right, steps }: { title: string; left: Node; right: Node; steps: { dir: 'r' | 'l' | 'both'; label: ReactNode; note?: string }[] }) {
  return (
    <figure className="relative my-8 border border-border bg-tile p-4 sm:p-6">
      <FrameCorners />
      <figcaption className="mb-4 font-mono text-[11px] text-muted-foreground uppercase">{title}</figcaption>
      <div className="grid grid-cols-[minmax(0,8rem)_1fr_minmax(0,8rem)] gap-x-3">
        <NodeBox n={left} />
        <div />
        <NodeBox n={right} />
      </div>
      <ol className="mt-4 flex flex-col gap-2">
        {steps.map((s, k) => (
          <li key={k} className="grid grid-cols-[minmax(0,8rem)_1fr_minmax(0,8rem)] items-center gap-x-3">
            <span className="text-right font-mono text-[10.5px] text-muted-foreground">{String(k + 1).padStart(2, '0')}</span>
            <div className="flex flex-col items-center">
              <span className="text-center text-[12.5px] text-heading">{s.label}</span>
              <span className="mt-1 flex w-full items-center">
                {(s.dir === 'l' || s.dir === 'both') && <ArrowLeft className="-mr-1 size-3.5 shrink-0 text-mark" />}
                <span className="h-px flex-1 bg-mark/60" />
                {(s.dir === 'r' || s.dir === 'both') && <ArrowRight className="-ml-1 size-3.5 shrink-0 text-mark" />}
              </span>
              {s.note && <span className="mt-1 text-center font-mono text-[10.5px] text-muted-foreground">{s.note}</span>}
            </div>
            <span />
          </li>
        ))}
      </ol>
    </figure>
  )
}

// ---------------------------------------------------------------- the table of contents

const TOC: { id: string; label: string; icon: LucideIcon; kicker?: string; dek?: string; sub?: [string, string][] }[] = [
  { id: 'overview', label: 'Overview', icon: Eye, kicker: 'The big picture', dek: 'Two apps, one idea: the phone stops being the thing you keep picking up.' },
  { id: 'install', label: 'Install', icon: Download, kicker: 'Getting started', dek: 'One line in the terminal, and it keeps itself current after that.', sub: [['requirements', 'Requirements'], ['updating', 'Updating'], ['uninstall', 'Uninstall']] },
  { id: 'connect', label: 'Connect a phone', icon: Plug, kicker: 'Setup', dek: 'Wi-Fi in a minute, or Developer mode for everything. Switch any time.', sub: [['wifi', 'Wi-Fi, no setup'], ['developer', 'Developer mode'], ['wireless', 'Wireless debugging']] },
  { id: 'using', label: 'Using the mirror', icon: MousePointerClick, kicker: 'Everyday', dek: 'Your mouse and keyboard become the phone’s fingers.', sub: [['gestures', 'Mouse & trackpad'], ['shortcuts', 'Shortcuts'], ['clipboard', 'Clipboard & files'], ['capture', 'Screenshots & recordings'], ['windows', 'Windows']] },
  { id: 'second-screens', label: 'Second screens', icon: Layers, kicker: 'Feature', dek: 'A second, independent screen of the same phone, in its own window.' },
  { id: 'unlock', label: 'Unlock with Touch ID', icon: Fingerprint, kicker: 'Feature', dek: 'Your PIN, typed for you, behind Touch ID.' },
  { id: 'palette', label: '⌘K and the menu bar', icon: Command, kicker: 'Feature', dek: 'Open any phone app by name without touching the phone.' },
  { id: 'phone-app', label: 'The phone app', icon: Smartphone, kicker: 'The other half', dek: 'A 2.9 MB companion that makes the link two-way.', sub: [['phone-screens', 'Screens'], ['share', 'Share to Mac'], ['permissions', 'Permissions']] },
  { id: 'agents', label: 'Coding agents (MCP)', icon: Bot, kicker: 'Cover story', dek: 'Let your agent test the app while you keep your phone.', sub: [['agents-setup', 'Setup'], ['agent-screen', 'The agent screen'], ['tools', 'Tools'], ['reliability', 'How actions run'], ['agent-settings', 'Settings']] },
  { id: 'architecture', label: 'How it works', icon: Cpu, kicker: 'Under the hood', dek: 'One video pipeline, three ways in.' },
  { id: 'security', label: 'Security & privacy', icon: ShieldCheck, kicker: 'Trust', dek: 'Your phone stays between your phone and your Mac.' },
  { id: 'troubleshooting', label: 'Troubleshooting', icon: Wrench, kicker: 'Help desk', dek: 'The seven things people run into, and the fix for each.' },
  { id: 'build', label: 'Build from source', icon: Hammer, kicker: 'For tinkerers', dek: 'Clone it, run it, change it.' },
]

function useActive(ids: string[]) {
  const [active, setActive] = useState(ids[0]!)
  useEffect(() => {
    const els = ids.map((id) => document.getElementById(id)).filter((e): e is HTMLElement => !!e)
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setActive(visible[0].target.id)
      },
      { rootMargin: '-80px 0px -70% 0px' },
    )
    els.forEach((e) => io.observe(e))
    return () => io.disconnect()
  }, [ids])
  return active
}

const SERIF = { fontFamily: "'Fraunces Variable', Georgia, serif", fontVariationSettings: "'SOFT' 50, 'WONK' 0" }

/** A chapter opener: a big numeral, a kicker, the headline in the display serif, and a dek. */
function H2({ id, icon: Icon, children }: { id: string; icon: LucideIcon; children: ReactNode }) {
  const k = TOC.findIndex((t) => t.id === id)
  const t = TOC[k]
  return (
    <header id={id} className="mt-28 scroll-mt-20 border-t border-heading/80 pt-6">
      <div className="flex items-center gap-3 font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
        <span className="text-mark">Chapter {String(k + 1).padStart(2, '0')}</span>
        <span aria-hidden className="h-px w-6 bg-border" />
        <Icon className="size-3.5 text-mark" strokeWidth={1.8} />
        {t?.kicker}
      </div>
      <div className="mt-5 flex items-start gap-5">
        <span aria-hidden className="hidden text-[5.5rem] leading-[0.8] font-light text-transparent [-webkit-text-stroke:1px_var(--color-input-border)] sm:block" style={SERIF}>
          {String(k + 1).padStart(2, '0')}
        </span>
        <div className="min-w-0">
          <h2 className="text-[2.5rem] leading-[1.05] font-medium tracking-[-0.02em] text-heading sm:text-[3.1rem]" style={SERIF}>
            <a href={`#${id}`} className="hover:text-mark">
              {children}
            </a>
          </h2>
          {t?.dek && <p className="mt-4 text-xl leading-snug text-foreground italic" style={{ fontFamily: "'Source Serif 4 Variable', Georgia, serif" }}>{t.dek}</p>}
        </div>
      </div>
    </header>
  )
}

/** A pull quote: a line worth lifting out of the text. */
function Quote({ children, by }: { children: ReactNode; by?: string }) {
  return (
    <blockquote className="relative my-12 border-l-2 border-mark py-1 pl-6">
      <p className="text-[1.75rem] leading-[1.25] font-normal tracking-[-0.01em] text-heading italic" style={SERIF}>
        “{children}”
      </p>
      {by && <footer className="mt-3 font-mono text-[11px] tracking-[0.12em] text-muted-foreground uppercase">— {by}</footer>}
    </blockquote>
  )
}

/** A strip of big numbers. */
function Numbers({ items }: { items: [string, string][] }) {
  return (
    <div className="relative my-10 grid grid-cols-2 border-y border-border sm:grid-cols-4">
      {items.map(([v, l]) => (
        <div key={l} className="border-border px-4 py-5 not-first:border-l max-sm:[&:nth-child(3)]:border-l-0">
          <p className="text-4xl font-medium tracking-tight text-heading" style={SERIF}>
            {v}
          </p>
          <p className="mt-1 text-xs leading-snug text-muted-foreground">{l}</p>
        </div>
      ))}
    </div>
  )
}

function H3({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h3 id={id} className="mt-12 scroll-mt-24 text-[1.55rem] font-medium tracking-[-0.01em] text-heading" style={SERIF}>
      <a href={`#${id}`} className="hover:underline">
        {children}
      </a>
    </h3>
  )
}

const P = ({ children, drop = false }: { children: ReactNode; drop?: boolean }) => (
  <p
    className={`mt-5 text-[1.12rem] leading-[1.8] text-foreground ${drop ? 'first-letter:float-left first-letter:mt-1.5 first-letter:mr-3 first-letter:text-[4.6rem] first-letter:leading-[0.8] first-letter:font-medium first-letter:text-heading' : ''}`}
    style={{ fontFamily: "'Source Serif 4 Variable', Georgia, serif" }}
  >
    {children}
  </p>
)
const UL = ({ children }: { children: ReactNode }) => <ul style={{ fontFamily: "'Source Serif 4 Variable', Georgia, serif" }} className="mt-5 flex flex-col gap-3 text-[1.08rem] leading-[1.75] [&>li]:relative [&>li]:pl-5 [&>li]:before:absolute [&>li]:before:top-[0.7em] [&>li]:before:left-0.5 [&>li]:before:size-1.5 [&>li]:before:rounded-full [&>li]:before:bg-mark/70">{children}</ul>

// ---------------------------------------------------------------- the page

export function Docs() {
  const { openDownload, latest } = useDownload()
  const ids = TOC.flatMap((t) => [t.id, ...(t.sub ?? []).map(([id]) => id)])
  const active = useActive(ids)
  const activeTop = TOC.find((t) => t.id === active || t.sub?.some(([id]) => id === active))?.id
  useEffect(() => {
    const id = window.location.hash.slice(1)
    if (id) setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }), 80)
  }, [])

  return (
    <main className="mx-auto max-w-6xl px-4 pt-16 pb-10 sm:px-6 lg:px-10">
      <div className="grid gap-12 lg:grid-cols-[14.5rem_minmax(0,1fr)]">
        {/* Contents, following you down the page. */}
        <nav aria-label="Contents" className="hidden lg:block">
          <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pr-2 pb-8">
            <p className="mb-3 font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">In this issue</p>
            <ol className="flex flex-col gap-0.5 text-sm">
              {TOC.map((t) => (
                <li key={t.id}>
                  <a
                    href={`#${t.id}`}
                    className={`flex items-center gap-2 rounded-[4px] px-2 py-1.5 transition-colors ${activeTop === t.id ? 'bg-primary/12 text-heading' : 'hover:text-heading'}`}
                  >
                    <span className={`w-5 shrink-0 font-mono text-[11px] ${activeTop === t.id ? 'text-mark' : 'text-muted-foreground'}`}>{String(TOC.indexOf(t) + 1).padStart(2, '0')}</span>
                    {t.label}
                  </a>
                  {t.sub && activeTop === t.id && (
                    <ol className="mt-0.5 mb-1 ml-[1.05rem] flex flex-col border-l border-border">
                      {t.sub.map(([id, label]) => (
                        <li key={id}>
                          <a href={`#${id}`} className={`-ml-px block border-l py-1 pl-3 text-[13px] ${active === id ? 'border-mark text-heading' : 'border-transparent hover:text-heading'}`}>
                            {label}
                          </a>
                        </li>
                      ))}
                    </ol>
                  )}
                </li>
              ))}
            </ol>
          </div>
        </nav>

        <article className="min-w-0 max-w-3xl text-[15.5px]">
          {/* The cover. */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-y border-heading/80 py-2.5 font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
            <span>The Twinglass Guide</span>
            <span>Issue {latest.version} · November 2026 · 15 min read</span>
          </div>
          <h1 className="mt-10 text-[3.4rem] leading-[0.95] font-medium tracking-[-0.035em] text-heading sm:text-[5.2rem]" style={SERIF}>
            Your phone,
            <br />
            <span className="italic text-mark">on your Mac.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-[1.35rem] leading-snug italic" style={{ fontFamily: "'Source Serif 4 Variable', Georgia, serif" }}>
            A field guide to mirroring your <Tag logo={siAndroid}>Android</Tag> phone on your <Tag logo={siApple}>Mac</Tag>, opening second screens of it, and letting
            coding agents test your apps, all in one sitting.
          </p>
          <div className="mt-8 flex items-center gap-3">
            <img src="/nikhil.webp" alt="" width={40} height={40} className="size-10 rounded-full border border-input-border" />
            <div className="text-sm">
              <p className="text-heading">
                By{' '}
                <a href="https://github.com/TrendySloth1001" target="_blank" rel="noopener noreferrer" className="hover:text-mark">
                  Nikhil Kumawat
                </a>
              </p>
              <p className="font-mono text-[11px] text-muted-foreground">Maker of Twinglass · @TrendySloth1001</p>
            </div>
          </div>
          <figure className="relative mt-10 border border-border bg-tile p-2 sm:p-3">
            <FrameCorners />
            <img src="/demo-poster.jpg" alt="Twinglass mirroring a phone on a Mac" width={1440} height={1098} className="w-full [clip-path:inset(1px_round_12px)]" />
            <figcaption className="mt-3 px-1 text-sm italic" style={{ fontFamily: "'Source Serif 4 Variable', Georgia, serif" }}>
              <span className="not-italic font-mono text-[11px] text-mark uppercase">On the cover</span> · Twinglass mirroring a Nothing Phone over Wi-Fi, with the phone
              app open on its Home screen.
            </figcaption>
          </figure>

          {/* In this issue: the contents as a magazine index. */}
          <section className="mt-14">
            <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">In this issue</p>
            <ol className="mt-4 grid border-t border-border sm:grid-cols-2">
              {TOC.map((t, k) => (
                <li key={t.id} className="border-b border-border sm:odd:border-r sm:odd:pr-6 sm:even:pl-6">
                  <a href={`#${t.id}`} className="group flex items-baseline gap-4 py-4">
                    <span className="font-mono text-xs text-mark">{String(k + 1).padStart(2, '0')}</span>
                    <span>
                      <span className="block text-lg leading-tight text-heading group-hover:text-mark" style={SERIF}>
                        {t.label}
                      </span>
                      <span className="mt-1 block text-[13px] leading-snug">{t.dek}</span>
                    </span>
                  </a>
                </li>
              ))}
            </ol>
          </section>
          <details className="mt-6 hidden">
            <summary className="cursor-pointer text-sm font-medium text-heading">Contents</summary>
            <ol className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
              {TOC.map((t) => (
                <li key={t.id}>
                  <a href={`#${t.id}`} className="flex items-center gap-2 py-1 hover:text-heading">
                    <t.icon className="size-4 text-mark" strokeWidth={1.7} /> {t.label}
                  </a>
                </li>
              ))}
            </ol>
          </details>

          {/* ------------------------------------------------ overview */}
          <div className="mt-14">
            <H2 id="overview" icon={Eye}>
              Overview
            </H2>
            <P drop>
              Twinglass is two apps that work together. <Tag icon={Laptop}>Twinglass for Mac</Tag> shows and controls the phone, opens second screens, and runs a
              server for coding agents. The <Tag icon={Smartphone}>phone app</Tag> links the phone to your Mac, mirrors it over Wi-Fi without developer options, and
              gives the Mac what adb alone can’t: real app icons, rich device details, sharing from any app, and reading buttons on any screen.
            </P>
            <Flow
              title="Fig. 1 · The big picture"
              nodes={[
                { logo: siAndroid, title: 'Your phone', sub: 'Android 10+ · phone app' },
                { icon: MonitorSmartphone, title: 'Twinglass for Mac', sub: 'decode · draw · control', tone: 'brand' },
                { icon: Bot, title: 'Your agent', sub: 'any MCP client' },
              ]}
              links={['USB · adb · Wi-Fi', 'MCP · localhost']}
            />
            <P>
              The Mac app works on its own over adb: it pushes the open-source <Tag icon={Terminal}>scrcpy</Tag> server to the phone and speaks its protocol directly.
              Nothing goes through a server on the internet, there are no accounts, and the only thing Twinglass fetches online is its own update check.
            </P>
            <Numbers
              items={[
                ['~12 ms', 'from a frame arriving to it being on your screen'],
                ['42', 'tools for coding agents'],
                ['2.9 MB', 'the whole phone app'],
                ['0', 'accounts, servers or analytics'],
              ]}
            />
          </div>

          {/* ------------------------------------------------ install */}
          <H2 id="install" icon={Download}>
            Install
          </H2>
          <P drop>Three ways, all the same app. The terminal is the quickest and opens without any macOS warning.</P>
          <CodeBlock lines={[INSTALL]} />
          <P>
            Or with <Tag logo={siHomebrew}>Homebrew</Tag> (Homebrew 7 asks you to trust a third-party tap once):
          </P>
          <CodeBlock lines={['brew tap TrendySloth1001/tap && brew trust TrendySloth1001/tap', 'brew install --cask twinglass']} />
          <P>
            Or download the <Tag icon={Package}>DMG</Tag> and drag Twinglass into Applications.{' '}
            <button type="button" onClick={openDownload} className="text-mark hover:underline">
              Download Twinglass {latest.version}
            </button>
            .
          </P>
          <Callout kind="warn" title="“Twinglass can’t be opened”">
            Twinglass isn’t notarized yet. If you downloaded the DMG in a browser and macOS refuses to open it, run <Code>xattr -cr /Applications/Twinglass.app</Code>{' '}
            once. The terminal and Homebrew installs don’t need this.
          </Callout>

          <H3 id="requirements">Requirements</H3>
          <Table
            head={['', 'Needs']}
            rows={[
              [
                <span className="flex items-center gap-2">
                  <Logo logo={siApple} /> Mac
                </span>,
                'Apple Silicon (M1 or newer), macOS 13 Ventura or newer',
              ],
              [
                <span className="flex items-center gap-2">
                  <Logo logo={siAndroid} /> Phone
                </span>,
                'Android 10 or newer',
              ],
              [
                <span className="flex items-center gap-2">
                  <Terminal className="size-4" /> adb
                </span>,
                <>
                  Only for Developer mode. Install with <Code>brew install android-platform-tools</Code>. Twinglass uses your adb and never bundles Google’s.
                </>,
              ],
            ]}
          />

          <H3 id="updating">Updating</H3>
          <P>Both apps keep themselves current, and the phone app never goes online for it.</P>
          <Flow
            title="Fig. 2 · How updates travel"
            nodes={[
              { logo: siGithub, title: 'GitHub Releases', sub: 'DMG + SHA-256' },
              { icon: MonitorSmartphone, title: 'Twinglass for Mac', sub: 'verifies, swaps, reopens', tone: 'brand' },
              { logo: siAndroid, title: 'Phone app', sub: 'from your Mac' },
            ]}
            links={['launch + every 6 h', 'adb install · Wi-Fi download']}
          />
          <UL>
            <li>
              <span className="text-heading">The Mac app</span> checks shortly after launch and every 6 hours. <Tag icon={RefreshCw}>Update</Tag> downloads the DMG,
              checks its SHA-256 and bundle id, swaps the app in place and reopens. Check any time in Settings → About.
            </li>
            <li>
              <span className="text-heading">The phone app</span> ships inside each Mac release. In Developer mode the Mac offers it when a connected phone has an
              older one (installed over adb, settings kept). In Wi-Fi mode the phone’s Home shows <em>Update available</em> and downloads it from your Mac.
            </li>
          </UL>

          <H3 id="uninstall">Uninstall</H3>
          <CodeBlock lines={['# remove the app (add --purge to remove its settings too)', 'curl -fsSL https://raw.githubusercontent.com/TrendySloth1001/TwinGlass/master/install.sh | bash -s -- --uninstall']} />
          <P>
            Screenshots and recordings in <Code>~/Pictures/Twinglass</Code> and <Code>~/Movies/Twinglass</Code> are left alone. Uninstall the phone app like any
            other app.
          </P>

          {/* ------------------------------------------------ connect */}
          <H2 id="connect" icon={Plug}>
            Connect a phone
          </H2>
          <P drop>There are two ways in, and you can switch any time. Start with Wi-Fi in a minute; switch to Developer mode when you want everything.</P>
          <Table
            head={['', 'Wi-Fi, no setup', 'Developer mode']}
            rows={[
              ['Phone needs', 'The Twinglass phone app', 'USB debugging, once'],
              ['Pairing', 'Scan a QR, or type a 6-digit code', 'Tap Allow on the phone'],
              ['Video', 'Screen capture → H.264, encrypted', 'scrcpy-server over adb'],
              ['Control', 'Taps, swipes, typing (accessibility)', 'Full multi-touch, keyboard, clipboard'],
              ['Second screens, agents, PIN unlock', '—', <Check key="c" className="size-4 text-ok" />],
            ]}
          />

          <H3 id="wifi">Wi-Fi, no setup</H3>
          <UL>
            <li>
              On the Mac, click <Tag icon={Smartphone}>Add phone</Tag>. Scan the <Tag icon={QrCode}>QR</Tag> with the phone’s camera: it downloads the phone app
              straight from your Mac.
            </li>
            <li>
              Open the app, choose <em>Wi-Fi, no setup → Pair with your Mac → Scan QR code</em>, and scan the same QR. Or pick your Mac from the list and type the
              6-digit code it shows.
            </li>
            <li>
              Tap <Tag icon={ScreenShare}>Mirror to Mac</Tag> and allow Android’s screen sharing. A window opens on the Mac by itself.
            </li>
          </UL>
          <Callout kind="tip" title="Turn on control from the Mac">
            For taps, swipes, Back, Home and typing, turn on <em>Control from your Mac</em> on the phone’s Home. It’s Android’s accessibility switch for the
            Twinglass phone app.
          </Callout>

          <H3 id="developer">Developer mode</H3>
          <UL>
            <li>
              Install adb: <Code>brew install android-platform-tools</Code>.
            </li>
            <li>
              On the phone, turn on <em>Developer options</em> (tap Build number seven times in About phone), then <em>USB debugging</em>.
            </li>
            <li>
              Plug in with a <Tag icon={Usb}>USB</Tag> cable and tap <em>Allow</em> on the phone. Twinglass mirrors straight away.
            </li>
          </UL>
          <Flow
            title="Fig. 3 · Developer mode, one tunnel"
            nodes={[
              { icon: Terminal, title: 'scrcpy-server', sub: 'pushed by the Mac' },
              { icon: Cable, title: 'adb', sub: 'USB or wireless' },
              { icon: Film, title: 'Video pipeline', sub: 'demux → decode → draw', tone: 'brand' },
              { icon: Monitor, title: 'Your window', sub: 'up to 120 Hz' },
            ]}
            links={['H.265 / H.264', 'video · audio · control', '~12 ms on the Mac']}
          />
          <Callout title="Xiaomi, Redmi and POCO">
            These also need <em>USB debugging (Security settings)</em> turned on, followed by a reboot. Without it the phone mirrors but ignores input.
          </Callout>

          <H3 id="wireless">Wireless debugging</H3>
          <P>
            Android 11 and newer can do Developer mode over <Tag icon={Wifi}>Wi-Fi</Tag>. Turn on <em>Wireless debugging</em> in Developer options, then use{' '}
            <em>Add phone → Wireless debugging</em> on the Mac and pair with the code or QR it shows. After that it reconnects by itself whenever both are on the same
            network.
          </P>

          {/* ------------------------------------------------ using */}
          <H2 id="using" icon={MousePointerClick}>
            Using the mirror
          </H2>
          <P drop>Click the mirror once so it has keyboard focus. From then on your mouse and keyboard are the phone’s touch screen and keys.</P>

          <H3 id="gestures">Mouse & trackpad</H3>
          <Table
            head={['You do', 'The phone gets']}
            rows={[
              ['Click', 'Tap'],
              ['Click and hold', 'Long-press'],
              ['Drag', 'Swipe or drag'],
              [<Kbd key="k">⌥ Drag</Kbd>, 'Pinch and rotate around the screen’s centre'],
              [<Kbd key="k">⌥⇧ Drag</Kbd>, 'Two-finger vertical swipe'],
              ['Trackpad pinch', 'Pinch-zoom at the cursor'],
              ['Scroll / two-finger scroll', 'Scroll'],
              ['Right-click', 'Back'],
              ['Middle-click', 'Home'],
              ['Type', 'Text into the focused field'],
              [<Kbd key="k">⌘V</Kbd>, 'Paste the Mac’s clipboard on the phone'],
              [<Kbd key="k">⌘C / ⌘X</Kbd>, 'Copy or cut on the phone (syncs to the Mac)'],
            ]}
          />

          <H3 id="shortcuts">Shortcuts</H3>
          <div className="relative my-6 grid gap-px border border-border bg-border sm:grid-cols-2">
            <FrameCorners />
            {(
              [
                ['⌘B', 'Back'],
                ['⇧⌘H', 'Home'],
                ['⌘S', 'Recent apps'],
                ['⌘N', 'Notifications'],
                ['⇧⌘N', 'Quick settings'],
                ['⌘↑ / ⌘↓', 'Volume up / down'],
                ['⌘P', 'Power'],
                ['⌘R', 'Rotate'],
                ['⌘O', 'Phone screen off / on'],
                ['⌘L', 'Unlock with your saved PIN'],
                ['⌥⌘L', 'Type a PIN to unlock'],
                ['⇧⌘S', 'Screenshot'],
                ['⇧⌘R', 'Start / stop recording'],
                ['⌘D', 'Disconnect'],
                ['⌘K', 'Command palette'],
                ['⌘V', 'Paste the Mac’s clipboard'],
              ] as [string, string][]
            ).map(([k, l]) => (
              <div key={l} className="flex items-center justify-between gap-4 bg-background px-4 py-2.5 text-sm">
                <span>{l}</span>
                <Kbd>{k}</Kbd>
              </div>
            ))}
          </div>

          <H3 id="clipboard">Clipboard & files</H3>
          <UL>
            <li>
              <Tag icon={ClipboardCopy}>Clipboard</Tag> syncs both ways. Text typed in other languages and emoji go through the clipboard automatically.
            </li>
            <li>
              <Tag icon={FileDown}>Drop a file</Tag> on the mirror: an <Code>.apk</Code> installs, anything else lands in a phone folder you choose (Settings →
              Advanced → drop folder).
            </li>
            <li>
              From the phone, <em>Share → Send to Mac</em> in any app sends text, links, photos or files. Files land in <Code>~/Downloads/Twinglass</Code>.
            </li>
          </UL>

          <H3 id="capture">Screenshots & recordings</H3>
          <P>
            <Kbd>⇧⌘S</Kbd> saves a screenshot to <Code>~/Pictures/Twinglass</Code>; <Kbd>⇧⌘R</Kbd> starts and stops a recording saved to{' '}
            <Code>~/Movies/Twinglass</Code>. Screens that apps protect, such as PIN pads and banking apps, come out black: Android blocks them from capture, and
            that’s expected.
          </P>

          <H3 id="windows">Windows</H3>
          <UL>
            <li>
              A compact <Tag icon={Smartphone}>phone-shaped window</Tag> with a control rail, phone frames (3 styles × 7 finishes) and an optional navigation bar;
              or a <Tag icon={AppWindow}>full view</Tag> with a sidebar and status bar.
            </li>
            <li>Always on top, tile all mirror windows, rotation that sticks, screen off while mirroring, audio to the Mac or both.</li>
            <li>Video is hardware-decoded (H.265 when both sides support it, H.264 otherwise) and drawn once per display refresh.</li>
          </UL>

          {/* ------------------------------------------------ second screens */}
          <H2 id="second-screens" icon={Layers}>
            Second screens
          </H2>
          <P drop>
            A second screen is a real, independent display of the same phone, in its own Mac window. Keep chatting on the phone in your hand while you test another app
            on the Mac. Each one has Twinglass’s own home screen (an app grid with real icons), an app switcher, and keyboard input that stays on that screen.
          </P>
          <figure className="relative my-8 border border-border bg-tile p-4 sm:p-6">
            <FrameCorners />
            <figcaption className="mb-4 font-mono text-[11px] text-muted-foreground uppercase">Fig. · One phone, several screens</figcaption>
            <div className="grid gap-3 sm:grid-cols-3">
              {(
                [
                  [Smartphone, 'Phone screen', 'display 0 · in your hand', 'WhatsApp'],
                  [Layers, 'Second screen', 'virtual display · Mac window', 'Your app'],
                  [Bot, 'Agent screen', 'virtual display · for agents', 'The app under test'],
                ] as [LucideIcon, string, string, string][]
              ).map(([I, t, sub, app], k) => (
                <div key={t} className={`relative border p-4 ${k === 0 ? 'border-input-border bg-background' : 'border-primary/40 bg-primary/[0.06]'}`}>
                  <FrameCorners />
                  <p className="flex items-center gap-2 text-sm font-medium text-heading">
                    <I className="size-4 text-mark" strokeWidth={1.7} /> {t}
                  </p>
                  <p className="mt-1 font-mono text-[10.5px] text-muted-foreground">{sub}</p>
                  <div className="mt-3 flex h-24 items-center justify-center border border-input-border bg-input text-xs">{app}</div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">Apps run where you open them. Closing a screen moves its apps back to the phone, in the background.</p>
          </figure>
          <Quote>Chat on the phone in your hand while you test your app on the Mac.</Quote>
          <P>Open one from the sidebar or the toolbar. Choose phone, tablet or landscape size in Settings → Advanced. Second screens need Developer mode.</P>

          {/* ------------------------------------------------ unlock */}
          <H2 id="unlock" icon={Fingerprint}>
            Unlock with Touch ID
          </H2>
          <P drop>
            Save your phone’s PIN once (<Kbd>⌘L</Kbd> the first time, with <em>Remember</em>). After that <Kbd>⌘L</Kbd> types it for you, after{' '}
            <Tag icon={Fingerprint}>Touch ID</Tag> if you turned that on. <Kbd>⌥⌘L</Kbd> lets you type one by hand.
          </P>
          <UL>
            <li>Works on the lock screen, on app locks, and in apps that use Android’s biometric prompt (it switches the prompt to “Use PIN”).</li>
            <li>The saved PIN is encrypted with your macOS keychain and never leaves the Mac.</li>
            <li>A wrong PIN is never retried, so a typo can’t lock you out.</li>
            <li>Coding agents can unlock too, but only after you approve with Touch ID, every time.</li>
          </UL>

          {/* ------------------------------------------------ palette */}
          <H2 id="palette" icon={Command}>
            ⌘K and the menu bar
          </H2>
          <UL>
            <li>
              <Kbd>⌘K</Kbd> opens the command palette: open any phone app by name, send a link that opens on the phone, send text, or paste from clipboard history.
              The history is kept in memory only and skips copies from password managers.
            </li>
            <li>The menu bar icon lists every phone with its battery, mirrors one in a click, and can launch Twinglass at login.</li>
            <li>
              <em>Phone details</em> shows the SoC, Android build and API level, memory, storage, display, battery health and cycles, cameras, sensors, codecs, network
              and features. Filter it, click any value to copy.
            </li>
          </UL>

          {/* ------------------------------------------------ phone app */}
          <H2 id="phone-app" icon={Smartphone}>
            The phone app
          </H2>
          <P drop>
            A 2.9 MB app built with <Tag logo={siKotlin}>Kotlin</Tag> and <Tag logo={siJetpackcompose}>Jetpack Compose</Tag>. It talks only to your paired Mac and
            never uses the internet.
          </P>
          <H3 id="phone-screens">Screens</H3>
          <Table
            head={['Screen', 'What’s on it']}
            rows={[
              ['Landing', 'The first-run choice: Wi-Fi, no setup (recommended) or Full control. Switchable later.'],
              ['Home', 'Where you stand (Wi-Fi mode, almost, or full potential) and the one next step, your Mac and Mirror to Mac, and the phone at a glance.'],
              ['Device', 'Every detail in 12 groups, searchable. Long-press to copy as text, Markdown or JSON.'],
              ['Settings', 'Appearance, Home, Device details, Share to Mac, What the Mac may use, Connection, Screen, About, What’s new.'],
              ['Connected to', 'Your Mac, how the phone is linked, response time, what the Mac is doing with the phone, and forget.'],
            ]}
          />
          <H3 id="share">Share to Mac</H3>
          <P>
            In any app, choose <em>Share → Send to Mac</em>. Text and links go onto the Mac’s clipboard; photos and files land in <Code>~/Downloads/Twinglass</Code>,
            with an optional date in the file name.
          </P>
          <H3 id="permissions">Permissions</H3>
          <Table
            head={['Permission', 'Why']}
            rows={[
              ['Internet, network state', 'The link to your Mac on your network'],
              ['Wi-Fi multicast', 'Finding your Mac on the Wi-Fi (mDNS)'],
              ['Foreground service (screen sharing)', 'Mirroring runs as a foreground service, as Android requires'],
              ['Notifications', 'The single “Mirroring to Mac” notification with a Stop button (optional)'],
              ['Accessibility: Twinglass control', 'Control from the Mac in Wi-Fi mode, and reading screens for agents. Off until you turn it on'],
            ]}
          />
          <Callout kind="tip" title="You decide what the Mac reads">
            In <em>Settings → What the Mac may use</em>, switch off device details, app icons or agent requests, and Android refuses them.
          </Callout>

          {/* ------------------------------------------------ agents */}
          <H2 id="agents" icon={Bot}>
            Coding agents (MCP)
          </H2>
          <P drop>
            Twinglass runs a local MCP server so <Tag logo={siClaude}>Claude Code</Tag>, <Tag logo={siCursor}>Cursor</Tag>, <Tag icon={Code2}>VS Code</Tag> and any
            other MCP client can see and operate the phone, and test the app you’re building.
          </P>
          <Quote by="The idea behind the agent screen">Your agent gets its own screen and real tools, and you keep your phone.</Quote>
          <H3 id="agents-setup">Setup</H3>
          <UL>
            <li>
              In Twinglass, open <em>Settings → Agents</em> and switch on <em>Agent access (MCP)</em>.
            </li>
            <li>
              Click <em>Copy Claude Code setup</em> and paste it into a terminal once. It looks like this, with your token filled in:
            </li>
          </UL>
          <CodeBlock lines={['claude mcp add --transport http --scope user \\', '  mob-mirror http://127.0.0.1:38297/mcp \\', '  --header "Authorization: Bearer <token>"']} />
          <P>
            In Claude Code, run <Code>/mcp</Code> to check <Code>mob-mirror</Code> is connected. Cursor and VS Code use the same URL and header in their MCP settings.
          </P>
          <Callout kind="warn" title="Only connect tools you trust">
            An agent can see whatever is on the phone’s screen, and the AI tool may send it to its provider. Keep agent access off while sensitive apps are open.
          </Callout>

          <H3 id="agent-screen">The agent screen</H3>
          <P>
            By default agents work on their own second screen, the <Tag icon={Bot}>agent screen</Tag>. It opens in a window on the Mac without taking focus, so you can
            watch, and nothing the agent does shows on the phone in your hand. Pass <Code>screen: "phone"</Code> to work on the real screen instead.
          </P>
          <Flow
            title="Fig. 4 · One agent step"
            nodes={[
              { logo: siClaude, title: 'Agent', sub: 'calls a tool' },
              { icon: Server, title: 'MCP server', sub: 'localhost · token', tone: 'brand' },
              { logo: siAndroid, title: 'Phone app', sub: 'reads · presses' },
              { icon: Check, title: 'Result', sub: 'after the screen settles' },
            ]}
            links={['tap_element', 'adb · accessibility', 'checked']}
          />

          <H3 id="tools">Tools</H3>
          <Table
            head={['Group', 'Tools']}
            rows={(
              [
                ['Phones', ['list_devices', 'device_info', 'phone_details']],
                ['Agent screen', ['agent_screen']],
                ['See', ['screenshot', 'get_ui_tree', 'find_elements', 'screen_map']],
                ['Act by element', ['tap_element', 'set_text', 'wait_for']],
                ['Act by coordinates', ['tap', 'long_press', 'swipe', 'scroll', 'type_text', 'press_key']],
                ['Batches', ['run_steps', 'wait']],
                ['Apps', ['list_apps', 'launch_app', 'open_url', 'stop_app']],
                ['App testing', ['install_apk', 'app_info', 'start_activity', 'clear_app_data', 'uninstall_app', 'set_permission', 'get_crashes', 'logcat', 'app_performance']],
                ['Conditions', ['set_device_state']],
                ['Dev servers & files', ['reverse_port', 'push_file', 'pull_file', 'list_files']],
                ['Other', ['get_notifications', 'set_clipboard', 'record_screen', 'unlock_phone', 'shell']],
              ] as [string, string[]][]
            ).map(([g, tools]) => [
              g,
              <span key={g} className="flex flex-wrap gap-1">
                {tools.map((t) => (
                  <Code key={t}>{t}</Code>
                ))}
              </span>,
            ])}
          />
          <P>
            <Code>screen_map</Code> is the one to use when building UI: every view in dp (position, size, insets, gaps), layout params, text size in sp, sampled
            colours, plus an annotated image. <Code>run_steps</Code> runs up to 50 actions in one call. <Code>shell</Code> is off unless you allow it.
          </P>

          <H3 id="reliability">How actions run</H3>
          <UL>
            <li>Every action returns only after the screen has settled (no window changed for 300 ms, at most 2.5 s), so the next step never lands mid-animation.</li>
            <li>
              <Code>tap_element</Code> and <Code>set_text</Code> keep looking for up to 2.5 s while menus open. A plain label presses the row around it.
            </li>
            <li>
              <Code>set_text</Code> reads the field back and fails with what the field shows, instead of reporting a change that didn’t happen.
            </li>
            <li>
              <Code>scroll</Code> says whether the content moved. Element trees leave out the keyboard and the status and navigation bars unless asked.
            </li>
          </UL>

          <H3 id="agent-settings">Settings</H3>
          <Table
            head={['Setting', 'Options']}
            rows={[
              ['Agents work on', 'Their own second screen, or the phone’s screen'],
              ['Agent screen size', 'Phone 1080×2400, the same as the phone, or tablet 1600×2560'],
              ['Close the agent screen when idle', 'Never, or after 5, 15 or 30 minutes'],
              ['What agents may do', 'Files and installs, clearing / uninstalling / permissions, phone settings (on); shell commands (off)'],
              ['Agents read any screen', 'Uses the phone app to read elements on any display, the agent screen included'],
            ]}
          />

          {/* ------------------------------------------------ architecture */}
          <H2 id="architecture" icon={Cpu}>
            How it works
          </H2>
          <P drop>
            Whichever way the phone connects, its screen arrives in the same format, scrcpy’s stream framing, so one demuxer, one hardware decoder, one recorder and one
            screenshot path serve every mode.
          </P>
          <Flow
            title="Fig. 5 · One video pipeline"
            nodes={[
              { logo: siAndroid, title: 'Phone', sub: 'scrcpy-server or phone app' },
              { icon: Film, title: 'Demuxer', sub: 'codec · size · frames' },
              { icon: Cpu, title: 'WebCodecs', sub: 'hardware decode', tone: 'brand' },
              { icon: Monitor, title: 'Canvas', sub: 'one draw per refresh' },
            ]}
            links={['adb or encrypted Wi-Fi', 'H.265 / H.264', '~12 ms total']}
          />
          <Sequence
            title="Fig. 6 · Wi-Fi pairing and an encrypted session"
            left={{ logo: siAndroid, title: 'Phone app', sub: 'scans the QR' }}
            right={{ logo: siApple, title: 'Mac', sub: 'port 47200 · mDNS' }}
            steps={[
              { dir: 'r', label: 'pair: phone id, P-256 public key' },
              { dir: 'l', label: 'Mac’s P-256 public key' },
              { dir: 'both', label: 'both derive a key from ECDH + the 6-digit code', note: 'HKDF-SHA256, code as salt' },
              { dir: 'r', label: 'confirm: HMAC(key, "phone")' },
              { dir: 'l', label: 'confirm: HMAC(key, "mac")', note: 'a wrong code fails here' },
              { dir: 'r', label: 'hello: id, nonce, app version' },
              { dir: 'both', label: 'per-direction AES-256-GCM keys', note: 'counter IVs, replay-proof' },
              { dir: 'r', label: 'video frames (H.264)' },
              { dir: 'l', label: 'taps, keys, clipboard' },
            ]}
          />
          <P>
            The full design, with every byte layout checked against the scrcpy 5.0.1 source, lives in the repository:{' '}
            <a className="text-mark hover:underline" href={`${REPO}/blob/master/docs/ARCHITECTURE.md`} target="_blank" rel="noopener noreferrer">
              ARCHITECTURE.md
            </a>{' '}
            and{' '}
            <a className="text-mark hover:underline" href={`${REPO}/blob/master/docs/FACTS.md`} target="_blank" rel="noopener noreferrer">
              FACTS.md
            </a>
            .
          </P>

          {/* ------------------------------------------------ security */}
          <H2 id="security" icon={ShieldCheck}>
            Security & privacy
          </H2>
          <figure className="relative my-8 flex flex-col items-center gap-4 border border-border bg-tile p-6 sm:flex-row">
            <FrameCorners />
            <NodeBox n={{ logo: siAndroid, title: 'Your phone', sub: 'phone app' }} />
            <div className="flex flex-col items-center gap-1 px-2">
              <Lock className="size-5 text-mark" />
              <span className="font-mono text-[10.5px] text-muted-foreground">USB · adb · AES-256-GCM</span>
            </div>
            <NodeBox n={{ logo: siApple, title: 'Your Mac', sub: 'Twinglass' }} />
            <div className="flex flex-col items-center gap-1 px-2 text-muted-foreground">
              <span className="relative">
                <Cloud className="size-6 opacity-40" />
                <CloudOff className="absolute inset-0 size-6" />
              </span>
              <span className="font-mono text-[10.5px]">no server</span>
            </div>
          </figure>
          <Quote>No servers in the middle. Your phone stays between your phone and your Mac.</Quote>
          <UL>
            <li>
              <span className="text-heading">Wi-Fi link:</span> a P-256 key exchange confirmed by the 6-digit code (codes expire after 5 minutes or 3 tries), then
              AES-256-GCM on every frame with per-direction keys and replay protection.
            </li>
            <li>
              <span className="text-heading">Forgetting is two-way:</span> forget on the Mac or the phone and the other side forgets too.
            </li>
            <li>
              <span className="text-heading">Phone app receivers</span> the Mac uses over adb require the <Code>DUMP</Code> permission, which only the adb shell has,
              so other apps can’t use them.
            </li>
            <li>
              <span className="text-heading">Agent access</span> is off by default, listens only on <Code>127.0.0.1</Code>, checks Host and Origin, and needs a
              256-bit token stored with mode 600.
            </li>
            <li>
              <span className="text-heading">Updates are verified</span> against the release’s SHA-256 and bundle id, and the old app is kept if the copy fails.
            </li>
            <li>
              <span className="text-heading">No accounts, analytics or telemetry.</span> The{' '}
              <a href="/privacy" className="text-mark hover:underline">
                privacy policy
              </a>{' '}
              spells out exactly what stays where.
            </li>
          </UL>

          {/* ------------------------------------------------ troubleshooting */}
          <H2 id="troubleshooting" icon={Wrench}>
            Troubleshooting
          </H2>
          <div className="mt-6 flex flex-col divide-y divide-border border-y border-border">
            {(
              [
                [Usb, 'My phone doesn’t appear', <>Install adb (<Code>brew install android-platform-tools</Code>), turn on USB debugging, plug in and tap <em>Allow</em> on the phone. Try another cable: some only charge.</>],
                [MousePointerClick, 'It mirrors but ignores my clicks', <>On Xiaomi, Redmi and POCO, turn on <em>USB debugging (Security settings)</em> and reboot. In Wi-Fi mode, turn on <em>Control from your Mac</em> on the phone.</>],
                [Eye, 'Some apps or screens are black', <>Banking apps and PIN pads block screen capture. That’s Android protecting them, and expected.</>],
                [Wifi, 'The phone can’t find my Mac on Wi-Fi', <>Both need to be on the same network with Twinglass open on the Mac. Guest and office networks often block devices from seeing each other; use Developer mode there.</>],
                [AlertTriangle, 'macOS says Twinglass can’t be opened', <>Run <Code>xattr -cr /Applications/Twinglass.app</Code> once, or install from the terminal or Homebrew.</>],
                [Bot, 'My agent can only take screenshots', <>Turn on <em>Agents read any screen</em> in Settings → Agents, and allow the phone app’s accessibility switch when Android asks.</>],
                [Link2, 'The phone forgot my Mac', <>Tap <em>Link again</em> (Developer mode) or <em>Pair again</em> (Wi-Fi) on the phone’s Home.</>],
              ] as [LucideIcon, string, ReactNode][]
            ).map(([I, q, a]) => (
              <div key={q} className="flex gap-4 py-5">
                <span className="flex size-8 shrink-0 items-center justify-center border border-input-border bg-input text-mark">
                  <I className="size-4" strokeWidth={1.7} />
                </span>
                <div>
                  <p className="font-medium text-heading">{q}</p>
                  <p className="mt-1 text-sm leading-relaxed">{a}</p>
                </div>
              </div>
            ))}
          </div>
          <P drop>
            Still stuck?{' '}
            <a href={`${REPO}/issues/new`} target="_blank" rel="noopener noreferrer" className="text-mark hover:underline">
              Open an issue
            </a>{' '}
            with your Mac and phone models (Settings → About → Copy version details helps).
          </P>

          {/* ------------------------------------------------ build */}
          <H2 id="build" icon={Hammer}>
            Build from source
          </H2>
          <P drop>
            The Mac app is <Tag icon={Code2}>Electron</Tag> with React and TypeScript; the phone app is <Tag logo={siKotlin}>Kotlin</Tag>. Source:{' '}
            <a href={REPO} target="_blank" rel="noopener noreferrer" className="text-mark hover:underline">
              github.com/TrendySloth1001/TwinGlass
            </a>
            .
          </P>
          <CodeBlock
            lines={[
              'npm install                 # also downloads scrcpy-server 5.0.1 and checks its SHA-256',
              'env -u ELECTRON_RUN_AS_NODE npm run dev',
              'npm test',
              'npm run companion:build     # the phone app',
              'npm run release             # phone app + changelog + DMG + Homebrew cask',
            ]}
          />
          <Table
            head={['Folder', 'What’s in it']}
            rows={[
              [<Code key="c">src/shared/scrcpy</Code>, 'The scrcpy protocol: control encoders and the stream demuxer'],
              [<Code key="c">src/main/adb</Code>, 'A client for your adb server’s socket'],
              [<Code key="c">src/main/direct</Code>, 'Wi-Fi, no setup: pairing, the encrypted link, mDNS'],
              [<Code key="c">src/main/agent</Code>, 'The MCP server and the device controller behind it'],
              [<Code key="c">src/renderer</Code>, 'The React interface and the video, input and audio engine'],
              [<Code key="c">companion/</Code>, 'The Android phone app'],
            ]}
          />

          <div className="mt-24 border-t border-heading/80 pt-8">
            <p className="text-[2rem] leading-tight font-medium tracking-[-0.02em] text-heading" style={SERIF}>
              That’s the issue.
            </p>
            <p className="mt-3 max-w-xl text-[1.12rem] leading-[1.8] italic" style={{ fontFamily: "'Source Serif 4 Variable', Georgia, serif" }}>
              Thanks for reading. If something here didn’t match what you saw on your phone, tell me and the next issue will fix it.
            </p>
            <p className="mt-4 flex items-center gap-2 text-sm">
              <img src="/nikhil.webp" alt="" width={24} height={24} className="size-6 rounded-full" /> Nikhil
            </p>
          </div>
          <div className="relative mt-12 flex flex-col items-start gap-4 border border-border bg-tile p-6 sm:flex-row sm:items-center sm:justify-between">
            <FrameCorners />
            <div>
              <p className="font-medium text-heading">Ready to try it?</p>
              <p className="mt-1 text-sm">Free for Apple Silicon Macs. It updates itself and brings the phone app along.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={openDownload} className="inline-flex h-10 items-center gap-1.5 rounded-[4px] bg-heading px-4 text-sm font-medium text-background hover:opacity-85">
                <Download className="size-4" /> Download
              </button>
              <a href="/changelog" className="inline-flex h-10 items-center gap-1.5 rounded-[4px] border border-heading/70 px-4 text-sm font-medium text-heading hover:bg-muted">
                <FolderOpen className="size-4" /> What’s new
              </a>
            </div>
          </div>
          <p className="mt-6 text-xs text-muted-foreground">
            Found a mistake in these docs?{' '}
            <a className="underline" href={`${REPO}/issues/new`} target="_blank" rel="noopener noreferrer">
              Tell me on GitHub
            </a>
            .
          </p>
        </article>
      </div>
    </main>
  )
}
