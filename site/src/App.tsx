import {
  ArrowRight,
  ArrowUpRight,
  Bot,
  Check,
  Command,
  Copy,
  Download,
  Fingerprint,
  Layers,
  MonitorSmartphone,
  Share2,
  ShieldCheck,
  Wifi,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import changelog from './data/changelog.json'
import release from './data/release.json'

const REPO = release.repo
const INSTALL = 'curl -fsSL https://raw.githubusercontent.com/TrendySloth1001/TwinGlass/master/install.sh | bash'
const BREW = 'brew tap TrendySloth1001/tap && brew trust TrendySloth1001/tap\nbrew install --cask twinglass'

// ---------------------------------------------------------------- pieces

/** Corner marks on a framed box, drawn on its hairlines (as on Credoodle). */
function FrameCorners() {
  const corners = ['-top-px -left-px border-t border-l', '-top-px -right-px border-t border-r', '-bottom-px -left-px border-b border-l', '-bottom-px -right-px border-b border-r']
  return corners.map((c) => <span key={c} aria-hidden className={`absolute size-3.5 border-foreground/60 ${c}`} />)
}

function Chip({ children, dot = false }: { children: ReactNode; dot?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 font-mono text-[11px] text-muted-foreground">
      {dot && <span aria-hidden className="size-1.5 rounded-full bg-mark" />}
      {children}
    </span>
  )
}

/** The hover button from Credoodle: a dot that grows to fill it. */
function HoverButton({ href, children, download }: { href: string; children: ReactNode; download?: boolean }) {
  return (
    <a
      href={href}
      {...(download ? { download: '' } : { target: '_blank', rel: 'noopener noreferrer' })}
      className="group relative inline-flex h-12 items-center overflow-hidden rounded-full border border-foreground/15 bg-background px-6 font-semibold focus-visible:outline-2 focus-visible:outline-mark"
    >
      <span className="flex items-center gap-2.5">
        <span className="size-2 rounded-full bg-foreground transition-transform duration-300 group-hover:scale-[100] group-focus-visible:scale-[100] motion-reduce:transition-none" />
        <span className="transition-all duration-300 group-hover:translate-x-12 group-hover:opacity-0 motion-reduce:transition-none">{children}</span>
      </span>
      <span
        aria-hidden
        className="absolute inset-0 flex translate-x-12 items-center justify-center gap-2 text-background opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100 motion-reduce:transition-none"
      >
        {children}
        <ArrowRight className="size-4" />
      </span>
    </a>
  )
}

function GhostLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex h-12 items-center gap-1.5 rounded-full px-5 font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {children}
      <ArrowUpRight className="size-4" />
    </a>
  )
}

function CopyCommand({ command, label }: { command: string; label: string }) {
  const [done, setDone] = useState(false)
  return (
    <div className="relative flex items-start gap-3 rounded-xl border border-border bg-tile p-3 pl-4 text-left">
      <span className="mt-1 shrink-0 font-mono text-[11px] text-muted-foreground uppercase">{label}</span>
      <pre className="min-w-0 flex-1 overflow-x-auto py-0.5 font-mono text-[13px] leading-relaxed whitespace-pre text-foreground">{command}</pre>
      <button
        type="button"
        aria-label={`Copy the ${label} command`}
        onClick={() =>
          void navigator.clipboard.writeText(command).then(() => {
            setDone(true)
            setTimeout(() => setDone(false), 1400)
          })
        }
        className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:text-foreground"
      >
        {done ? <Check className="size-4 text-mark" /> : <Copy className="size-4" />}
      </button>
    </div>
  )
}

function SectionLabel({ n, children }: { n: string; children: ReactNode }) {
  return (
    <p className="flex items-center gap-2 font-mono text-xs text-muted-foreground uppercase">
      <span className="text-foreground">{n}</span>
      <span aria-hidden className="h-px w-6 bg-border" />
      {children}
    </p>
  )
}

/** The newest release on GitHub, so the download button never goes stale between site deploys. */
function useLatest() {
  const [latest, setLatest] = useState({ version: release.version, dmg: release.dmg })
  useEffect(() => {
    fetch('https://api.github.com/repos/TrendySloth1001/TwinGlass/releases/latest', { headers: { Accept: 'application/vnd.github+json' } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { tag_name?: string; assets?: { name: string; browser_download_url: string }[] } | null) => {
        const dmg = j?.assets?.find((a) => a.name.endsWith('arm64.dmg'))?.browser_download_url
        if (j?.tag_name && dmg) setLatest({ version: j.tag_name.replace(/^v/, ''), dmg })
      })
      .catch(() => {})
  }, [])
  return latest
}

// ---------------------------------------------------------------- sections

function Header() {
  const capsule = 'pointer-events-auto flex items-center gap-0.5 rounded-full border border-border bg-background/90 p-1 text-sm shadow-sm backdrop-blur-xl'
  return (
    <header className="pointer-events-none sticky top-0 z-50 h-0 px-4 sm:px-6 lg:px-10">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 pt-3">
        <div className={capsule}>
          <a href="#top" className="flex h-9 items-center gap-2 rounded-full px-3 font-semibold tracking-tight">
            <img src="/icon.png" alt="" className="size-5 rounded-[5px]" />
            Twinglass
          </a>
        </div>
        <nav aria-label="Main" className={capsule}>
          {[
            ['Features', '#features'],
            ['Agents', '#agents'],
            ['What’s new', '#changelog'],
          ].map(([label, href]) => (
            <a key={href} href={href} className="hidden h-9 items-center rounded-full px-3 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:flex">
              {label}
            </a>
          ))}
          <a href={REPO} target="_blank" rel="noopener noreferrer" aria-label="GitHub" className="flex h-9 items-center gap-1.5 rounded-full px-3 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <GithubMark />
            <span className="hidden md:inline">GitHub</span>
          </a>
          <a href="#download" className="flex h-9 items-center gap-1.5 rounded-full bg-foreground px-4 font-medium text-background">
            <Download className="size-4" />
            Download
          </a>
        </nav>
      </div>
    </header>
  )
}

/** The recording: plays like a GIF (silent, looping, inline); a still for people who asked for less motion. */
function DemoVideo() {
  const [still, setStill] = useState(false)
  useEffect(() => {
    const q = window.matchMedia('(prefers-reduced-motion: reduce)')
    setStill(q.matches)
    const on = (e: MediaQueryListEvent) => setStill(e.matches)
    q.addEventListener('change', on)
    return () => q.removeEventListener('change', on)
  }, [])
  if (still) return <img src="/demo-poster.jpg" alt="Twinglass on a Mac, mirroring an Android phone" className="w-full" width={1440} height={1098} />
  return (
    <video
      className="w-full"
      width={1440}
      height={1098}
      poster="/demo-poster.jpg"
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      aria-label="Twinglass on a Mac, mirroring an Android phone while moving through the Twinglass phone app"
    >
      <source src="/demo.webm" type="video/webm" />
      <source src="/demo.mp4" type="video/mp4" />
    </video>
  )
}

function Hero({ latest }: { latest: { version: string; dmg: string } }) {
  return (
    <section id="top" className="mx-auto flex max-w-6xl flex-col items-center px-4 pt-32 text-center sm:px-6 lg:px-10 lg:pt-40">
      <a href="#changelog" className="mb-6">
        <Chip dot>
          New in {latest.version} · {changelog.releases[0]?.title}
        </Chip>
      </a>
      <h1 className="font-soft max-w-3xl text-[2.9rem] leading-[1.02] font-semibold tracking-tight text-balance sm:text-6xl lg:text-7xl">Your Android phone, on your Mac.</h1>
      <p className="mt-6 max-w-xl text-lg text-pretty text-muted-foreground">
        Mirror it, use it with your mouse and keyboard, open a second screen of it next to the real one, and let coding agents test apps on it. Over USB, wireless
        debugging, or plain Wi-Fi.
      </p>
      <div className="mt-9 flex flex-wrap items-center justify-center gap-2">
        <HoverButton href={latest.dmg} download>
          Download for Mac
        </HoverButton>
        <GhostLink href={REPO}>View on GitHub</GhostLink>
      </div>
      <p className="mt-4 font-mono text-xs text-muted-foreground">Free · v{latest.version} · macOS 13+ · Apple Silicon · Android 10+</p>

      <div className="relative mt-16 w-full border border-border bg-tile p-2 sm:p-3">
        <FrameCorners />
        <DemoVideo />
      </div>
    </section>
  )
}

const FEATURES: { icon: ReactNode; title: string; body: string }[] = [
  { icon: <MonitorSmartphone />, title: 'Mirror and control', body: 'Hardware-decoded video, about 12 ms on the Mac side. Your mouse and keyboard become touch and keys.' },
  { icon: <Layers />, title: 'Second screens', body: 'Open another screen of the same phone in its own window, and test one app while you use another.' },
  { icon: <Wifi />, title: 'Wi-Fi, no setup', body: 'Scan a QR with the phone and mirror over an encrypted link. No developer options needed.' },
  { icon: <Fingerprint />, title: 'Unlock with Touch ID', body: 'Your saved PIN, typed for you after Touch ID. Works on lock screens and in-app prompts.' },
  { icon: <Command />, title: '⌘K for the phone', body: 'Open any phone app by name, send a link to it, or paste from your clipboard history.' },
  { icon: <Share2 />, title: 'Both ways', body: 'Clipboard sync, drag files onto the mirror, and share to the Mac from any app on the phone.' },
]

function Features() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-4 pt-28 sm:px-6 lg:px-10">
      <SectionLabel n="01">What it does</SectionLabel>
      <h2 className="font-soft mt-4 max-w-2xl text-4xl leading-tight font-semibold tracking-tight text-balance">The phone stops being the thing you keep picking up.</h2>
      {/* A layout sheet: boxes cut by hairlines, corner marks where they meet. */}
      <div className="relative mt-10 grid border-t border-l border-border sm:grid-cols-2 lg:grid-cols-3">
        <FrameCorners />
        {FEATURES.map((f) => (
          <div key={f.title} className="flex flex-col gap-3 border-r border-b border-border p-6 sm:p-8">
            <span className="flex size-9 items-center justify-center rounded-full border border-border text-foreground [&_svg]:size-4">{f.icon}</span>
            <h3 className="text-lg font-semibold tracking-tight">{f.title}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">{f.body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function Connect() {
  const modes = [
    {
      name: 'Wi-Fi, no setup',
      tag: 'Easiest',
      steps: ['Click Add phone on the Mac', 'Scan the QR with your phone', 'Tap Mirror to Mac'],
      gets: ['Mirroring', 'Taps, swipes and typing', 'Encrypted on your network'],
    },
    {
      name: 'Developer mode',
      tag: 'Everything',
      steps: ['Turn on USB debugging', 'brew install android-platform-tools', 'Plug in and tap Allow'],
      gets: ['Second screens', 'Full multi-touch and unlock', 'All 42 agent tools'],
    },
  ]
  return (
    <section className="mx-auto max-w-6xl px-4 pt-28 sm:px-6 lg:px-10">
      <SectionLabel n="02">Connecting</SectionLabel>
      <h2 className="font-soft mt-4 max-w-2xl text-4xl leading-tight font-semibold tracking-tight text-balance">Two ways in. Switch whenever you like.</h2>
      <div className="mt-10 grid gap-4 md:grid-cols-2">
        {modes.map((m) => (
          <div key={m.name} className="relative border border-border p-6 sm:p-8">
            <FrameCorners />
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold tracking-tight">{m.name}</h3>
              <Chip>{m.tag}</Chip>
            </div>
            <ol className="mt-6 flex flex-col gap-3">
              {m.steps.map((s, i) => (
                <li key={s} className="flex items-baseline gap-3 text-sm">
                  <span className="font-mono text-xs text-muted-foreground">0{i + 1}</span>
                  {s.startsWith('brew') ? <code className="font-mono text-[13px]">{s}</code> : s}
                </li>
              ))}
            </ol>
            <div className="mt-6 flex flex-wrap gap-1.5 border-t border-border pt-5">
              {m.gets.map((g) => (
                <Chip key={g}>{g}</Chip>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

const TOOLS = [
  'screenshot', 'get_ui_tree', 'screen_map', 'tap_element', 'set_text', 'wait_for', 'scroll', 'run_steps', 'launch_app', 'open_url',
  'install_apk', 'start_activity', 'logcat', 'get_crashes', 'app_performance', 'set_device_state', 'set_permission', 'record_screen', 'unlock_phone',
]

function Agents() {
  return (
    <section id="agents" className="mx-auto max-w-6xl px-4 pt-28 sm:px-6 lg:px-10">
      <div className="grid items-start gap-10 lg:grid-cols-[1fr_1.1fr]">
        <div className="min-w-0">
          <SectionLabel n="03">For coding agents</SectionLabel>
          <h2 className="font-soft mt-4 text-4xl leading-tight font-semibold tracking-tight text-balance">Let your agent test the app while you keep using your phone.</h2>
          <p className="mt-5 max-w-lg text-muted-foreground">
            Twinglass has an MCP server for Claude Code, Cursor and VS Code. Agents get their own second screen of the phone, so nothing they do shows up on the
            one in your hand. Every action waits for the screen to settle, and text fields are read back, so it never reports a change that didn’t happen.
          </p>
          <div className="mt-6 flex flex-wrap gap-1.5">
            {TOOLS.map((t) => (
              <Chip key={t}>{t}</Chip>
            ))}
            <Chip dot>+23 more</Chip>
          </div>
        </div>
        <div className="relative min-w-0 border border-border bg-tile p-5 sm:p-6">
          <FrameCorners />
          <div className="flex items-center gap-2 text-sm font-medium">
            <Bot className="size-4" /> One line to connect Claude Code
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Settings → Agents → Copy Claude Code setup gives you this, with your token filled in.</p>
          <pre className="mt-4 overflow-x-auto rounded-lg border border-border bg-background p-4 font-mono text-[12.5px] leading-relaxed">
            {'claude mcp add --transport http --scope user \\\n  mob-mirror http://127.0.0.1:38297/mcp \\\n  --header "Authorization: Bearer <token>"'}
          </pre>
          <div className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
            Off by default. Listens only on your Mac, needs a token, and agents can’t unlock the phone without your Touch ID.
          </div>
          <a href={`${REPO}/blob/master/docs/AGENTS.md`} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex items-center gap-1 text-sm font-medium hover:underline">
            All 42 tools <ArrowUpRight className="size-3.5" />
          </a>
        </div>
      </div>
    </section>
  )
}

function WhatsNew() {
  const [r, ...older] = changelog.releases
  if (!r) return null
  return (
    <section id="changelog" className="mx-auto max-w-6xl px-4 pt-28 sm:px-6 lg:px-10">
      <SectionLabel n="04">What’s new</SectionLabel>
      <div className="relative mt-8 border border-border p-6 sm:p-8">
        <FrameCorners />
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="font-soft text-3xl font-semibold tracking-tight">{r.title}</h2>
          <span className="font-mono text-xs text-muted-foreground">
            v{r.version} · phone app {r.phone} · {r.date}
          </span>
        </div>
        <p className="mt-3 max-w-2xl text-muted-foreground">{r.summary}</p>
        <ul className="mt-6 grid gap-x-10 gap-y-2.5 text-sm md:grid-cols-2">
          {[...r.mac, ...r.phoneApp].slice(0, 8).map((l) => (
            <li key={l} className="flex gap-2.5">
              <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-mark" />
              <span>{l}</span>
            </li>
          ))}
        </ul>
        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border pt-5 text-sm">
          {older.map((o) => (
            <span key={o.version} className="font-mono text-xs text-muted-foreground">
              v{o.version} · {o.title}
            </span>
          ))}
          <a href={`${REPO}/blob/master/CHANGELOG.md`} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 font-medium hover:underline">
            Full changelog <ArrowUpRight className="size-3.5" />
          </a>
        </div>
      </div>
    </section>
  )
}

function DownloadSection({ latest }: { latest: { version: string; dmg: string } }) {
  return (
    <section id="download" className="mx-auto max-w-6xl px-4 pt-28 sm:px-6 lg:px-10">
      <div className="relative border border-border px-6 py-12 text-center sm:px-12 sm:py-16">
        <FrameCorners />
        <img src="/icon-large.png" alt="" className="mx-auto size-20 rounded-[22%] shadow-sm" width={80} height={80} />
        <h2 className="font-soft mt-6 text-4xl font-semibold tracking-tight sm:text-5xl">Get Twinglass</h2>
        <p className="mx-auto mt-3 max-w-md text-muted-foreground">
          Free for macOS 13 or newer on Apple Silicon. It updates itself, and it brings the phone app along. Your phone never has to download anything.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
          <HoverButton href={latest.dmg} download>
            Download v{latest.version}
          </HoverButton>
          <GhostLink href={`${REPO}/releases`}>All releases</GhostLink>
        </div>
        <div className="mx-auto mt-10 flex max-w-2xl flex-col gap-2">
          <CopyCommand label="Terminal" command={INSTALL} />
          <CopyCommand label="Homebrew" command={BREW} />
        </div>
        <p className="mx-auto mt-5 max-w-xl text-xs text-muted-foreground">
          It isn’t notarized yet. The terminal and Homebrew installs open straight away. If you download the DMG in a browser, run{' '}
          <code className="font-mono">xattr -cr /Applications/Twinglass.app</code> once.
        </p>
      </div>
    </section>
  )
}

function Footer() {
  const link = 'flex min-h-9 items-center gap-1 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline'
  const heading = 'text-xs font-medium tracking-wide uppercase'
  const out = (href: string, label: string) => (
    <li key={label}>
      <a href={href} target="_blank" rel="noopener noreferrer" className={link}>
        {label} <ArrowUpRight className="size-3.5" />
      </a>
    </li>
  )
  return (
    <footer className="mx-auto mt-28 max-w-6xl px-4 pb-6 sm:px-6 lg:px-10">
      <div className="relative flex flex-col gap-12 border border-border px-6 pt-10 sm:px-10">
        <FrameCorners />
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="col-span-2 flex max-w-sm flex-col gap-3 lg:col-span-1">
            <span className="flex items-center gap-2 font-semibold tracking-tight">
              <img src="/icon.png" alt="" className="size-5 rounded-[5px]" /> Twinglass
            </span>
            <p className="text-sm text-muted-foreground">
              An indie Mac app for people who work next to an Android phone. No accounts, no analytics. Everything stays between your phone and your Mac.
            </p>
          </div>
          <nav aria-labelledby="f-product" className="flex flex-col gap-2">
            <h2 id="f-product" className={heading}>
              Product
            </h2>
            <ul className="text-sm">
              <li>
                <a href="#features" className={link}>
                  Features
                </a>
              </li>
              <li>
                <a href="#agents" className={link}>
                  For agents
                </a>
              </li>
              <li>
                <a href="#download" className={link}>
                  Download
                </a>
              </li>
            </ul>
          </nav>
          <nav aria-labelledby="f-project" className="flex flex-col gap-2">
            <h2 id="f-project" className={heading}>
              Project
            </h2>
            <ul className="text-sm">
              {out(REPO, 'GitHub')}
              {out(`${REPO}/releases`, 'Releases')}
              {out(`${REPO}/blob/master/CHANGELOG.md`, 'Changelog')}
            </ul>
          </nav>
          <nav aria-labelledby="f-help" className="flex flex-col gap-2">
            <h2 id="f-help" className={heading}>
              Help
            </h2>
            <ul className="text-sm">
              {out(`${REPO}/issues/new`, 'Report a problem')}
              {out(`${REPO}/blob/master/docs/AGENTS.md`, 'Agent setup')}
              {out(`${REPO}/blob/master/docs/ARCHITECTURE.md`, 'How it works')}
            </ul>
          </nav>
        </div>
        <p className="text-xs text-muted-foreground">
          © 2026 Nikhil Kumawat · Built on{' '}
          <a href="https://github.com/Genymobile/scrcpy" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">
            scrcpy
          </a>
          . Not affiliated with Google or Genymobile. Android is a trademark of Google LLC.
        </p>
        {/* The name set large and cut off by the frame, as a sign-off. */}
        <div aria-hidden className="overflow-hidden">
          <p className="-mb-[0.2em] text-center text-[clamp(2.5rem,13vw,12rem)] leading-none font-semibold tracking-tighter whitespace-nowrap text-muted select-none">
            Twinglass
          </p>
        </div>
      </div>
    </footer>
  )
}

function GithubMark() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden className="size-4">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  )
}

export function App() {
  const latest = useLatest()
  return (
    <>
      <Header />
      <main>
        <Hero latest={latest} />
        <Features />
        <Connect />
        <Agents />
        <WhatsNew />
        <DownloadSection latest={latest} />
      </main>
      <Footer />
    </>
  )
}
