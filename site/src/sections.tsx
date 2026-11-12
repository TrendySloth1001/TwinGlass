import { ArrowLeftRight, ArrowUpRight, Bot, ChevronDown, Command, Fingerprint, KeyRound, Keyboard, Laptop, Layers, Lock, MonitorSmartphone, RefreshCw, ShieldCheck, SlidersHorizontal, Smartphone, Wifi, type LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Chip, FrameCorners, GhostLink, HoverButton, REPO, RELEASES, SectionHead } from './components/base'
import { DownloadPanel, useDownload } from './components/download'
import { AnimatedBeam, BlurFade, DotPattern, Marquee, NumberTicker, SpotlightCard, Typewriter, WordRotate } from './components/fx'

/** A thin line icon in a hairline circle: the site's only illustration style. */
function Glyph({ icon: Icon, size = 'size-10' }: { icon: LucideIcon; size?: string }) {
  return (
    <span className={`flex ${size} shrink-0 items-center justify-center rounded-md border border-input-border bg-input text-mark`}>
      <Icon className="size-[42%]" strokeWidth={1.6} />
    </span>
  )
}

const WRAP = 'mx-auto max-w-6xl px-4 sm:px-6 lg:px-10'

// ---------------------------------------------------------------- hero

function DemoVideo() {
  const [still, setStill] = useState(false)
  useEffect(() => {
    const q = window.matchMedia('(prefers-reduced-motion: reduce)')
    setStill(q.matches)
    const on = (e: MediaQueryListEvent) => setStill(e.matches)
    q.addEventListener('change', on)
    return () => q.removeEventListener('change', on)
  }, [])
  if (still) return <img src="/demo-poster.jpg" alt="Twinglass on a Mac, mirroring an Android phone" className="w-full [clip-path:inset(1px_round_14px)]" width={1440} height={1098} />
  return (
    <video className="w-full [clip-path:inset(1px_round_14px)]" width={1440} height={1098} poster="/demo-poster.jpg" autoPlay muted loop playsInline preload="auto" aria-label="Twinglass on a Mac, mirroring an Android phone">
      <source src="/demo.webm" type="video/webm" />
      <source src="/demo.mp4" type="video/mp4" />
    </video>
  )
}

export function Hero() {
  const { openDownload, latest } = useDownload()
  return (
    <section className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[42rem] bg-[radial-gradient(ellipse_60%_55%_at_50%_0%,rgb(0_120_212/0.28),transparent_70%)]" />
      <DotPattern className="[mask-image:radial-gradient(ellipse_at_top,black_10%,transparent_60%)]" />

      <div className={`relative flex flex-col items-center pt-32 text-center lg:pt-40 ${WRAP}`}>
        <BlurFade>
          <a href="/#changelog">
            <Chip dot>
              New in {latest.version} · {RELEASES[0]?.title}
            </Chip>
          </a>
        </BlurFade>
        <BlurFade delay={0.05}>
          <h1 className="font-soft mt-6 max-w-3xl text-[2.9rem] leading-[1.02] font-semibold tracking-tight text-balance sm:text-6xl lg:text-7xl">
            Your Android phone, on your Mac.
          </h1>
        </BlurFade>
        <BlurFade delay={0.1}>
          <p className="mt-5 font-mono text-sm text-muted-foreground sm:text-base">
            <WordRotate className="text-foreground" words={['Mirror it.', 'Control it with your keyboard.', 'Open a second screen.', 'Unlock it with Touch ID.', 'Let agents test on it.']} />
          </p>
        </BlurFade>
        <BlurFade delay={0.15}>
          <p className="mt-5 max-w-xl text-lg text-pretty text-muted-foreground">
            A free Mac app and a companion phone app that make your Android phone part of your desktop. Over USB, wireless debugging, or plain Wi-Fi with no
            developer options at all.
          </p>
        </BlurFade>
        <BlurFade delay={0.2}>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-2">
            <HoverButton onClick={openDownload}>Download for Mac</HoverButton>
            <GhostLink href={REPO}>View on GitHub</GhostLink>
          </div>
          <p className="mt-4 font-mono text-xs text-muted-foreground">Free · v{latest.version} · macOS 13+ · Apple Silicon · Android 10+</p>
        </BlurFade>
        <BlurFade delay={0.25} className="w-full">
          <div className="relative mt-16 w-full border border-border bg-tile p-2 shadow-[0_40px_100px_-40px_rgb(0_120_212/0.45)] sm:p-3">
            <FrameCorners />
            <DemoVideo />
          </div>
        </BlurFade>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- strip + numbers

const TAGS = ['USB', 'Wireless debugging', 'Wi-Fi, no setup', 'H.265 hardware decode', 'Touch ID unlock', '⌘K palette', 'Second screens', 'Clipboard sync', 'Drag & drop files', 'Screen recording', 'Share to Mac', 'MCP for agents', 'Encrypted link', 'Menu bar']

export function Strip() {
  return (
    <div className="mt-16 border-y border-border py-4">
      <Marquee seconds={45}>
        {TAGS.map((t) => (
          <Chip key={t}>{t}</Chip>
        ))}
      </Marquee>
    </div>
  )
}

export function Numbers() {
  const stats: { v: number; d?: number; unit: string; label: string; prefix?: string }[] = [
    { v: 12, prefix: '~', unit: 'ms', label: 'from packet to pixels on the Mac' },
    { v: 42, unit: 'tools', label: 'for coding agents over MCP' },
    { v: 2.9, d: 1, unit: 'MB', label: 'the whole phone app' },
    { v: 0, unit: 'accounts', label: 'no sign-up, no analytics, no cloud' },
  ]
  return (
    <section className={`pt-24 ${WRAP}`}>
      <div className="relative grid grid-cols-2 border-t border-l border-border lg:grid-cols-4">
        <FrameCorners />
        {stats.map((s, i) => (
          <BlurFade key={s.label} delay={i * 0.06} className="border-r border-b border-border p-6 sm:p-8">
            <p className="font-soft text-4xl font-semibold tracking-tight sm:text-5xl">
              {s.prefix}
              <NumberTicker value={s.v} decimals={s.d ?? 0} />
              <span className="ml-1.5 font-sans text-base font-medium text-muted-foreground">{s.unit}</span>
            </p>
            <p className="mt-2 text-sm text-muted-foreground">{s.label}</p>
          </BlurFade>
        ))}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- how it connects (animated beams)

function Node({ refEl, icon: Icon, title, sub }: { refEl: React.RefObject<HTMLDivElement | null>; icon: LucideIcon; title: string; sub: string }) {
  return (
    <div className="relative z-10 flex flex-col items-center gap-2 text-center">
      <div ref={refEl} className="relative flex size-20 items-center justify-center border border-input-border bg-background text-mark sm:size-24">
        <FrameCorners />
        <Icon className="size-8 sm:size-9" strokeWidth={1.4} />
      </div>
      <p className="text-sm font-semibold">{title}</p>
      <p className="max-w-[9rem] font-mono text-[11px] text-muted-foreground">{sub}</p>
    </div>
  )
}

export function HowItWorks() {
  const box = useRef<HTMLDivElement>(null)
  const phone = useRef<HTMLDivElement>(null)
  const mac = useRef<HTMLDivElement>(null)
  const agent = useRef<HTMLDivElement>(null)
  const paths = [
    { k: 'USB or wireless debugging', t: 'Developer mode', b: 'The Mac pushes the open-source scrcpy server through your own adb and talks to it directly. Lowest latency, full multi-touch, second screens.' },
    { k: 'Encrypted Wi-Fi', t: 'Wi-Fi, no setup', b: 'The phone app captures the screen and sends it over a link paired with a 6-digit code and encrypted with AES-256-GCM. No developer options.' },
    { k: 'MCP on localhost', t: 'Coding agents', b: 'Claude Code, Cursor or VS Code connect to a server on your Mac. It’s off by default and needs a token.' },
  ]
  return (
    <section id="how" className={`pt-28 ${WRAP}`}>
      <SectionHead n="02" label="How it works" title="One video pipeline, three ways in.">
        Either way, the phone’s screen arrives in the same format and one hardware decoder draws it on your Mac. Nothing goes through a server.
      </SectionHead>
      <div ref={box} className="relative mt-12 flex items-center justify-between gap-4 border border-border bg-tile px-4 py-12 text-foreground sm:px-16">
        <FrameCorners />
        <DotPattern className="opacity-60" />
        <Node refEl={phone} icon={Smartphone} title="Your phone" sub="Android 10+" />
        <Node refEl={mac} icon={Laptop} title="Twinglass for Mac" sub="decodes, draws, controls" />
        <Node refEl={agent} icon={Bot} title="Your agent" sub="any MCP client" />
        <AnimatedBeam container={box} from={phone} to={mac} curvature={60} />
        <AnimatedBeam container={box} from={phone} to={mac} curvature={-60} reverse delay={1.2} />
        <AnimatedBeam container={box} from={agent} to={mac} curvature={0} reverse duration={2.6} />
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {paths.map((p, i) => (
          <BlurFade key={p.t} delay={i * 0.07} className="relative border border-border p-6">
            <FrameCorners />
            <Chip>{p.k}</Chip>
            <h3 className="mt-4 text-lg font-semibold tracking-tight">{p.t}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.b}</p>
          </BlurFade>
        ))}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- features (bento)

const FEATURES: { icon: LucideIcon; title: string; body: string; span?: string }[] = [
  { icon: MonitorSmartphone, title: 'Mirror and control', body: 'Hardware-decoded H.265 or H.264 at the phone’s refresh rate. Your mouse and keyboard become touch and keys; right-click is Back, the wheel scrolls.', span: 'lg:col-span-2' },
  { icon: Layers, title: 'Second screens', body: 'Open another screen of the same phone in its own window, with its own home screen. Test one app while you use another.' },
  { icon: Wifi, title: 'Wi-Fi, no setup', body: 'Scan a QR with your phone. It downloads the phone app from your Mac, pairs, and mirrors. No cables, no developer options.' },
  { icon: Fingerprint, title: 'Unlock with Touch ID', body: 'Save your PIN once. Twinglass types it after Touch ID, on the lock screen and in apps that ask for it.' },
  { icon: Command, title: '⌘K for your phone', body: 'Open any phone app by name, send a link that opens on the phone, or paste from clipboard history.' },
  { icon: ArrowLeftRight, title: 'Both directions', body: 'Clipboard sync, drag files onto the mirror, and share from any phone app straight to your Mac.', span: 'lg:col-span-2' },
  { icon: Keyboard, title: 'Built for keyboards', body: 'Shortcuts for volume, power, rotate, notifications and quick settings. Non-English text goes through the clipboard.' },
  { icon: RefreshCw, title: 'Keeps itself current', body: 'Twinglass checks for new versions, verifies each download, swaps itself in place and reopens. Then it brings your phone the matching phone app, so neither side needs a store.', span: 'lg:col-span-3' },
]

export function Features() {
  return (
    <section id="features" className={`pt-28 ${WRAP}`}>
      <SectionHead n="01" label="What it does" title="The phone stops being the thing you keep picking up.">
        Everything you’d reach for the phone to do, from the Mac you’re already working on.
      </SectionHead>
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((f, i) => (
          <BlurFade key={f.title} delay={(i % 4) * 0.05} className={f.span}>
            <SpotlightCard className="h-full border border-border bg-tile p-6 transition-colors hover:border-primary/60 sm:p-7">
              <FrameCorners />
              <span className="inline-flex transition-transform duration-500 group-hover:-translate-y-0.5"><Glyph icon={f.icon} size="size-11" /></span>
              <h3 className="mt-6 text-lg font-semibold tracking-tight">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
            </SpotlightCard>
          </BlurFade>
        ))}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- the phone app

export function PhoneApp() {
  const points = [
    ['Knows where you stand', 'Home tells you if you’re on Wi-Fi mode or running at full potential, and what one step gets you further.'],
    ['Device details', 'SoC, Android build, memory, storage, display, battery health, cameras, sensors and codecs, in 12 searchable groups.'],
    ['Share to Mac', 'Send text, links, photos or files from any app’s share sheet. Files land in Downloads/Twinglass.'],
    ['Updates from your Mac', 'Every Mac release carries the newest phone app. The phone app itself never uses the internet.'],
  ]
  return (
    <section id="phone" className={`pt-28 ${WRAP}`}>
      <div className="grid items-center gap-12 lg:grid-cols-2">
        <div className="min-w-0">
          <SectionHead n="03" label="The phone app" title="A small companion that makes the link two-way.">
            2.9 MB, written in Kotlin and Jetpack Compose. It’s what makes Wi-Fi mode work, and it adds what adb can’t do on its own.
          </SectionHead>
          <div className="mt-8 grid gap-x-8 gap-y-6 sm:grid-cols-2">
            {points.map(([t, b], i) => (
              <BlurFade key={t} delay={i * 0.06}>
                <p className="flex items-center gap-2 font-semibold">
                  <span aria-hidden className="size-1.5 rounded-full bg-mark" />
                  {t}
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{b}</p>
              </BlurFade>
            ))}
          </div>
        </div>
        <BlurFade className="relative flex justify-center">
          {/* The real phone app, in a plain phone outline on the dot sheet. */}
          <div className="relative flex w-full max-w-md items-center justify-center border border-border bg-tile py-10">
            <FrameCorners />
            <DotPattern className="[mask-image:radial-gradient(circle,black,transparent_75%)]" />
            <div className="relative w-[15.5rem] rounded-[2.6rem] border border-input-border bg-[#0b0b0b] p-2 shadow-[0_30px_80px_-30px_rgb(0_120_212/0.5)] sm:w-[17rem]">
              <img src="/phone-app.webp" alt="The Twinglass phone app's Home screen" className="w-full rounded-[2.1rem]" width={565} height={1256} loading="lazy" />
            </div>
          </div>
        </BlurFade>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- agents

const TOOLS_A = ['screenshot', 'get_ui_tree', 'screen_map', 'find_elements', 'tap_element', 'set_text', 'wait_for', 'scroll', 'swipe', 'run_steps', 'launch_app', 'open_url', 'press_key', 'type_text']
const TOOLS_B = ['install_apk', 'start_activity', 'clear_app_data', 'logcat', 'get_crashes', 'app_performance', 'set_device_state', 'set_permission', 'record_screen', 'pull_file', 'push_file', 'reverse_port', 'unlock_phone', 'agent_screen']

export function Agents() {
  const points = [
    ['Their own screen', 'Agents work on a second screen of the phone, in a window you can watch. The phone in your hand stays yours.'],
    ['Waits for the screen', 'Every action returns once the screen has settled, so the next step never lands mid-animation.'],
    ['Never fakes success', 'Text fields are read back, scrolls report whether anything moved, and labels press the row around them.'],
  ]
  return (
    <section id="agents" className={`pt-28 ${WRAP}`}>
      <div className="grid items-start gap-12 lg:grid-cols-[1fr_1.05fr]">
        <div className="min-w-0">
          <SectionHead n="04" label="For coding agents" title="Let your agent test the app while you keep using your phone.">
            Twinglass runs an MCP server with 42 tools for Claude Code, Cursor, VS Code and any other MCP client: see the screen, act on it, install and launch apps,
            read logs and crashes, measure jank.
          </SectionHead>
          <div className="mt-8 flex flex-col gap-5">
            {points.map(([t, b], i) => (
              <BlurFade key={t} delay={i * 0.06} className="flex gap-4">
                <span className="font-mono text-xs text-muted-foreground">0{i + 1}</span>
                <div>
                  <p className="font-semibold">{t}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{b}</p>
                </div>
              </BlurFade>
            ))}
          </div>
        </div>
        <BlurFade className="relative min-w-0 border border-border bg-tile p-5 sm:p-6">
          <FrameCorners />
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-medium">
              <Bot className="size-4" /> Connect Claude Code in one line
            </span>
            <Glyph icon={Bot} size="size-9" />
          </div>
          <div className="relative mt-4 border border-border bg-background text-foreground">
            <FrameCorners />
            <div className="flex h-8 items-center justify-between border-b border-border px-3 font-mono text-[11px] text-muted-foreground uppercase">
              <span>Terminal</span>
              <span className="normal-case">zsh</span>
            </div>
            <Typewriter
              className="min-h-[7.5rem] overflow-x-auto p-4 font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap"
              text={'$ claude mcp add --transport http --scope user \\\n    mob-mirror http://127.0.0.1:38297/mcp \\\n    --header "Authorization: Bearer <token>"\n✓ Added mob-mirror'}
            />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Settings → Agents → Copy Claude Code setup gives you this with your token filled in.</p>
          <div className="mt-6 flex flex-col gap-2">
            <Marquee seconds={50}>
              {TOOLS_A.map((t) => (
                <Chip key={t}>{t}</Chip>
              ))}
            </Marquee>
            <Marquee seconds={50} reverse>
              {TOOLS_B.map((t) => (
                <Chip key={t}>{t}</Chip>
              ))}
            </Marquee>
          </div>
          <div className="mt-6 flex items-start gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
            Off by default. Listens only on your Mac, needs a token, and agents can’t unlock the phone without your Touch ID.
          </div>
        </BlurFade>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- privacy

export function PrivacyBlock() {
  const items: [LucideIcon, string, string][] = [
    [ShieldCheck, 'No accounts, no analytics', 'Nothing to sign up for and nothing that phones home. The only internet request is the update check.'],
    [Lock, 'Encrypted Wi-Fi link', 'P-256 key exchange confirmed by a 6-digit code, then AES-256-GCM on every frame.'],
    [KeyRound, 'Your PIN behind Touch ID', 'Saved PINs are encrypted with your keychain and typed only after you approve.'],
    [SlidersHorizontal, 'You decide what the Mac reads', 'Device details, app icons and agent access each switch off on the phone.'],
  ]
  return (
    <section id="privacy" className={`pt-28 ${WRAP}`}>
      <SectionHead n="05" label="Privacy" title="Your phone stays between your phone and your Mac.">
        No servers in the middle. Read the full <a className="font-medium text-foreground underline underline-offset-2" href="/privacy">privacy policy</a>.
      </SectionHead>
      <div className="relative mt-12 grid border-t border-l border-border sm:grid-cols-2 lg:grid-cols-4">
        <FrameCorners />
        {items.map(([img, t, b], i) => (
          <BlurFade key={t} delay={i * 0.05} className="border-r border-b border-border p-6">
            <Glyph icon={img} />
            <h3 className="mt-5 font-semibold tracking-tight">{t}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{b}</p>
          </BlurFade>
        ))}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- changelog

export function WhatsNew() {
  const [r, ...older] = RELEASES
  if (!r) return null
  return (
    <section id="changelog" className={`pt-28 ${WRAP}`}>
      <SectionHead n="06" label="What’s new" title={r.title} />
      <BlurFade className="relative mt-8 border border-border p-6 sm:p-8">
        <FrameCorners />
        <p className="font-mono text-xs text-muted-foreground">
          v{r.version} · phone app {r.phone} · {r.date}
        </p>
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
      </BlurFade>
    </section>
  )
}

// ---------------------------------------------------------------- FAQ

const FAQ: [string, ReactNode][] = [
  ['Is it free?', 'Yes. No trial, no account, no in-app purchases.'],
  ['Which Macs and phones?', 'Macs with Apple Silicon on macOS 13 or newer, and phones on Android 10 or newer. Intel Macs, Windows and Linux aren’t supported yet.'],
  ['Do I need developer options on my phone?', 'No. Wi-Fi, no setup mode only needs the phone app. Developer mode adds second screens, full multi-touch, PIN unlock and all the agent tools.'],
  ['Does the phone app need the internet?', 'No. It only talks to your paired Mac, and it gets its updates from your Mac too.'],
  ['Why does macOS warn me when I open it?', 'Twinglass isn’t notarized yet. Installing from the terminal or Homebrew avoids the warning. If you downloaded the DMG in a browser, run xattr -cr /Applications/Twinglass.app once.'],
  ['How does it update?', 'The Mac app checks GitHub for new releases, verifies the download’s SHA-256, swaps itself in place and reopens. It then offers the matching phone app to your phones.'],
  ['Does it work with iPhone?', 'No. Twinglass is built on Android’s own tools: adb, scrcpy and the accessibility service.'],
  ['Is my data safe with agents?', 'Agent access is off by default. If you turn it on, the AI tool you connect can see your phone’s screen and may send it to its provider, so only use it with tools you trust.'],
]

export function Faq() {
  return (
    <section id="faq" className={`pt-28 ${WRAP}`}>
      <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
        <SectionHead n="07" label="FAQ" title="Questions people ask." />
        <div className="divide-y divide-border border-y border-border">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group py-1 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-medium">
                {q}
                <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-300 group-open:rotate-180" />
              </summary>
              <p className="pb-5 text-sm leading-relaxed text-muted-foreground">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- download + footer

export function DownloadSection() {
  return (
    <section id="download" className={`pt-28 ${WRAP}`}>
      <BlurFade>
        <DownloadPanel />
      </BlurFade>
    </section>
  )
}

export function Footer() {
  const link = 'flex min-h-9 items-center gap-1 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline'
  const heading = 'text-xs font-medium tracking-wide uppercase'
  const out = (href: string, label: string) => (
    <li key={label}>
      <a href={href} target="_blank" rel="noopener noreferrer" className={link}>
        {label} <ArrowUpRight className="size-3.5" />
      </a>
    </li>
  )
  const local = (href: string, label: string) => (
    <li key={label}>
      <a href={href} className={link}>
        {label}
      </a>
    </li>
  )
  return (
    <footer className={`mt-28 pb-6 ${WRAP}`}>
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
              {local('/#features', 'Features')}
              {local('/#how', 'How it works')}
              {local('/#agents', 'For agents')}
              {local('/#download', 'Download')}
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
              Help & legal
            </h2>
            <ul className="text-sm">
              {local('/privacy', 'Privacy Policy')}
              {out(`${REPO}/issues/new`, 'Report a problem')}
              {out(`${REPO}/blob/master/docs/AGENTS.md`, 'Agent setup')}
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
        <div aria-hidden className="overflow-hidden">
          <p className="-mb-[0.2em] text-center text-[clamp(2.5rem,13vw,12rem)] leading-none font-semibold tracking-tighter whitespace-nowrap text-muted select-none">
            Twinglass
          </p>
        </div>
      </div>
    </footer>
  )
}
