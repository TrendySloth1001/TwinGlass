// The landing page, in Render's design language: near-black, one violet accent, left-aligned
// headlines, product panels over grainy glows, numbered steps with tiny UI mocks, hairline bento.
import {
  ArrowUpRight,
  AppWindow,
  Bell,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  Code2,
  QrCode,
  Clipboard,
  Command,
  Cpu,
  Download,
  FileDown,
  Fingerprint,
  KeyRound,
  Layers,
  Lock,
  MousePointerClick,
  Plus,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Terminal,
  Unlink,
  Usb,
  Video,
  Wifi,
  type LucideIcon,
} from 'lucide-react'
import { motion, useMotionValue, useReducedMotion, useScroll, useTransform, type MotionValue } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { siAndroid, siApple, siClaude, siCursor, siHomebrew, siJetpackcompose, siKotlin } from 'simple-icons'
import { Chip, FrameCorners, GhostLink, HoverButton, REPO, RELEASES, Tag } from './components/base'
import { DownloadPanel, useDownload } from './components/download'
import { BlurFade, Typewriter, WordRotate } from './components/fx'

const WRAP = 'mx-auto max-w-6xl px-4 sm:px-6 lg:px-10'
const DOCS = `${REPO}/blob/master/docs`

/** A violet glow with film grain, behind product panels and the closing call to action. */
function Glow({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`grain pointer-events-none absolute overflow-hidden bg-[radial-gradient(ellipse_70%_60%_at_50%_100%,rgb(124_92_255/0.55),rgb(91_108_255/0.18)_45%,transparent_75%)] ${className ?? ''}`}
    />
  )
}

function H2({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={`font-soft text-[2.2rem] leading-[1.06] text-balance sm:text-5xl ${className ?? ''}`}>{children}</h2>
}

function MoreLink({ href, children }: { href: string; children: ReactNode }) {
  const external = href.startsWith('http')
  return (
    <a href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})} className="inline-flex items-center gap-1 text-sm text-mark hover:underline">
      {children} <ChevronRight className="size-3.5" />
    </a>
  )
}

/** A tiny piece of fake UI: a framed panel the mocks sit in. */
function Mock({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`relative border border-input-border bg-input/80 text-[12.5px] ${className ?? ''}`}>{children}</div>
}

function Ok() {
  return (
    <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-ok/90 text-black">
      <Check className="size-3" strokeWidth={3} />
    </span>
  )
}

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
  const cls = 'w-full [clip-path:inset(1px_round_14px)]'
  if (still) return <img src="/demo-poster.jpg" alt="Twinglass on a Mac, mirroring an Android phone" className={cls} width={1440} height={1098} />
  return (
    <video className={cls} width={1440} height={1098} poster="/demo-poster.jpg" autoPlay muted loop playsInline preload="auto" aria-label="Twinglass on a Mac, mirroring an Android phone">
      <source src="/demo.webm" type="video/webm" />
      <source src="/demo.mp4" type="video/mp4" />
    </video>
  )
}

export function Hero() {
  const { openDownload, latest } = useDownload()
  return (
    <section className={`pt-24 sm:pt-28 ${WRAP}`}>
      <BlurFade>
        <a href="#changelog" className="inline-flex items-center gap-2 text-sm text-foreground hover:text-heading">
          <Chip dot>New</Chip>
          {RELEASES[0]?.title} in {latest.version}
          <ChevronRight className="size-3.5" />
        </a>
      </BlurFade>
      <BlurFade delay={0.05}>
        <h1 className="font-soft mt-6 max-w-4xl text-[2.9rem] leading-[1.02] text-balance sm:text-6xl lg:text-[4.5rem]">Your Android phone, on your Mac.</h1>
      </BlurFade>
      <BlurFade delay={0.1}>
        <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <p className="max-w-xl text-lg text-pretty">
            <WordRotate className="text-heading" words={['Mirror it.', 'Control it from your keyboard.', 'Open a second screen.', 'Unlock it with Touch ID.', 'Let agents test on it.']} />
            <br />
            Any <Tag logo={siAndroid}>Android</Tag> phone on your <Tag logo={siApple}>Mac</Tag>, over a <Tag icon={Usb}>USB</Tag> cable, wireless debugging, or
            plain <Tag icon={Wifi}>Wi-Fi</Tag> with no developer options. Free.
          </p>
          <div className="flex flex-wrap gap-2">
            <HoverButton onClick={openDownload}>Download for Mac</HoverButton>
            <GhostLink href={REPO}>View on GitHub</GhostLink>
          </div>
        </div>
      </BlurFade>

      <BlurFade delay={0.15}>
        <div className="relative mt-14 border border-border bg-tile px-3 pt-3 sm:px-10 sm:pt-10">
          <FrameCorners />
          <Glow className="inset-0" />
          {/* Render's signature: a bright grainy band under the product. */}
          <Glow className="inset-x-0 bottom-0 h-3/4 opacity-90 [background:radial-gradient(ellipse_90%_70%_at_50%_110%,rgb(124_92_255/0.75),rgb(70_60_200/0.3)_50%,transparent_80%)]" />
          <div className="relative">
            <DemoVideo />
          </div>
          {/* Small live-looking cards over the product, as Render does with its dashboard. */}
          <div className="pointer-events-none absolute bottom-10 left-6 hidden w-64 lg:block">
            <Mock className="bg-[#141418]/95 p-3 shadow-2xl backdrop-blur">
              <FrameCorners />
              <p className="flex items-center justify-between text-heading">
                A024{' '}
                <span className="flex items-center gap-1.5 text-[11px] text-ok">
                  <span className="size-1.5 animate-pulse rounded-full bg-ok" />
                  Mirroring
                </span>
              </p>
              <p className="mt-1 font-mono text-[11px] text-muted-foreground">Wi-Fi · 10 ms · 120 Hz · H.265</p>
            </Mock>
          </div>
          <div className="pointer-events-none absolute top-16 right-6 hidden w-72 lg:block">
            <Mock className="bg-[#141418]/95 p-3 font-mono text-[11px] shadow-2xl backdrop-blur">
              <FrameCorners />
              <p className="text-muted-foreground">agent · second screen</p>
              <p className="mt-1.5 text-heading">tap_element “Sign in”</p>
              <p className="mt-0.5 text-ok">✓ pressed · settled in 320 ms</p>
            </Mock>
          </div>
        </div>
      </BlurFade>
    </section>
  )
}

export function Strip() {
  return (
    <section className={`pt-16 ${WRAP}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-3 border-b border-border pb-10 text-[17px]">
        <p className="mr-3 font-mono text-[11px] text-muted-foreground uppercase">Works with</p>
        <Tag logo={siAndroid}>Android 10+</Tag>
        <Tag logo={siApple}>macOS 13+</Tag>
        <Tag icon={Terminal}>scrcpy</Tag>
        <Tag logo={siClaude}>Claude Code</Tag>
        <Tag logo={siCursor}>Cursor</Tag>
        <Tag icon={Code2}>VS Code</Tag>
        <Tag icon={Bot}>any MCP client</Tag>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- 1, 2, 3

function Num({ n }: { n: number }) {
  return <span className="flex size-7 items-center justify-center bg-primary text-sm font-semibold text-white">{n}</span>
}

export function Steps() {
  return (
    <section id="how" className={`pt-28 ${WRAP}`}>
      <H2>Install, connect, done.</H2>
      <div className="mt-12 grid gap-10 md:grid-cols-3">
        <BlurFade className="flex flex-col">
          <Num n={1} />
          <h3 className="mt-5 text-xl font-medium">Install Twinglass</h3>
          <p className="mt-2 text-sm leading-relaxed">
            One line in the <Tag icon={Terminal}>terminal</Tag>, <Tag logo={siHomebrew}>Homebrew</Tag>, or the DMG. It updates itself after that.
          </p>
          <Mock className="mt-6 flex-1 p-4 font-mono text-[12px] leading-relaxed">
            <FrameCorners />
            <p className="text-heading">$ curl -fsSL …/install.sh | bash</p>
            <p className="text-muted-foreground">→ Looking up the latest release</p>
            <p className="text-muted-foreground">→ Downloading Twinglass</p>
            <p className="text-muted-foreground">&nbsp; SHA-256 verified</p>
            <p className="text-ok">✓ Twinglass is installed</p>
          </Mock>
        </BlurFade>
        <BlurFade delay={0.08} className="flex flex-col">
          <Num n={2} />
          <h3 className="mt-5 text-xl font-medium">Connect your phone</h3>
          <p className="mt-2 text-sm leading-relaxed">
            Plug in a <Tag icon={Usb}>cable</Tag>, use wireless debugging, or scan a <Tag icon={QrCode}>QR</Tag> on Wi-Fi with no setup at all.
          </p>
          <Mock className="mt-6 flex-1 py-2">
            <FrameCorners />
            <p className="flex items-center gap-2 px-3 py-1.5 text-muted-foreground">
              <Plus className="size-3.5" /> Add phone
            </p>
            {(
              [
                [Usb, 'USB cable', 'A024', true],
                [Wifi, 'Wireless debugging', '', false],
                [Smartphone, 'Wi-Fi, no setup', 'scan QR', false],
              ] as [LucideIcon, string, string, boolean][]
            ).map(([Icon, label, note, on]) => (
              <p key={label} className={`flex items-center gap-2 px-3 py-2 ${on ? 'bg-primary/85 text-white' : 'text-heading'}`}>
                <Icon className="size-3.5" />
                {label}
                <span className={`ml-auto font-mono text-[11px] ${on ? 'text-white/80' : 'text-muted-foreground'}`}>{note}</span>
                {on && <Check className="size-3.5" />}
              </p>
            ))}
          </Mock>
        </BlurFade>
        <BlurFade delay={0.16} className="flex flex-col">
          <Num n={3} />
          <h3 className="mt-5 text-xl font-medium">Use it from your Mac</h3>
          <p className="mt-2 text-sm">Your phone opens in a window. Click, type, drag files, open a second screen.</p>
          <Mock className="mt-6 flex flex-1 flex-col gap-2.5 p-4">
            <FrameCorners />
            {[
              ['Mirroring A024', '120 Hz'],
              ['Second screen opened', 'Slack'],
              ['Clipboard synced', 'to phone'],
              ['photo.jpg received', '2.4 MB'],
            ].map(([t, m]) => (
              <p key={t} className="flex items-center gap-2.5 text-heading">
                <Ok />
                {t}
                <span className="ml-auto font-mono text-[11px] text-muted-foreground">{m}</span>
              </p>
            ))}
          </Mock>
        </BlurFade>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- bento

function Cell({ title, body, link, children }: { title: string; body: ReactNode; link?: [string, string]; children?: ReactNode }) {
  return (
    <div className="relative flex flex-col border-r border-b border-border p-7 sm:p-10">
      <h3 className="font-soft max-w-md text-2xl leading-tight sm:text-[1.7rem]">{title}</h3>
      <p className="mt-3 max-w-md text-sm leading-relaxed">{body}</p>
      {link && (
        <span className="mt-4">
          <MoreLink href={link[1]}>{link[0]}</MoreLink>
        </span>
      )}
      {children && <div className="mt-8 flex flex-1 items-end">{children}</div>}
    </div>
  )
}

export function Features() {
  return (
    <section id="features" className={`pt-28 ${WRAP}`}>
      <H2 className="max-w-3xl">Everything you reach for the phone to do, from your Mac.</H2>
      <BlurFade className="relative mt-12 grid border-t border-l border-border md:grid-cols-2">
        <FrameCorners />
        <Cell title="Mirror and control at full speed" body="Hardware-decoded video at the phone’s refresh rate. Your mouse and keyboard become touch and keys; right-click is Back." link={['How fast', `${DOCS}/FACTS.md`]}>
          <div className="grid w-full grid-cols-3 gap-2">
            {[
              ['12', 'ms', 'Mac pipeline'],
              ['120', 'Hz', 'refresh'],
              ['H.265', '', 'hardware'],
            ].map(([v, u, l]) => (
              <Mock key={l} className="p-3">
                <FrameCorners />
                <p className="font-soft text-2xl text-heading">
                  {v}
                  <span className="ml-0.5 text-sm text-muted-foreground">{u}</span>
                </p>
                <p className="mt-0.5 font-mono text-[10.5px] text-muted-foreground">{l}</p>
              </Mock>
            ))}
          </div>
        </Cell>
        <Cell title="A second screen of the same phone" body="Open another, independent screen in its own window. Chat on the phone while you test your app on the Mac." link={['How second screens work', `${DOCS}/ARCHITECTURE.md`]}>
          <div className="flex w-full items-end gap-3">
            <Mock className="h-36 flex-1 p-2.5">
              <FrameCorners />
              <p className="font-mono text-[10.5px] text-muted-foreground">phone</p>
              <div className="mt-2 grid grid-cols-4 gap-1.5">
                {Array.from({ length: 12 }, (_, k) => (
                  <span key={k} className="aspect-square rounded-[4px] bg-white/10" />
                ))}
              </div>
            </Mock>
            <Mock className="h-36 flex-[1.4] border-primary/60 p-2.5">
              <FrameCorners />
              <p className="flex items-center justify-between font-mono text-[10.5px] text-mark">
                second screen <Layers className="size-3" />
              </p>
              <div className="mt-2 space-y-1.5">
                <span className="block h-2 w-3/4 rounded-sm bg-white/15" />
                <span className="block h-2 w-1/2 rounded-sm bg-white/10" />
                <span className="block h-14 rounded-sm bg-primary/20" />
              </div>
            </Mock>
          </div>
        </Cell>
        <Cell title="Wi-Fi, with no setup" body={<>Scan the <Tag icon={QrCode}>QR</Tag> on your Mac. The phone app downloads straight from the Mac, pairs with a code and mirrors, encrypted with <Tag icon={Lock}>AES-256-GCM</Tag>.</>} link={['Pairing and encryption', `${DOCS}/ARCHITECTURE.md`]}>
          <Mock className="flex w-full items-center gap-5 p-4">
            <FrameCorners />
            <div className="grid size-16 shrink-0 grid-cols-6 gap-px bg-heading p-1">
              {'101101011010110011001101101001011101101100110110'.split('').map((b, k) => (
                <span key={k} className={b === '1' ? 'bg-black' : 'bg-heading'} />
              ))}
            </div>
            <div>
              <p className="font-mono text-[11px] text-muted-foreground">pairing code</p>
              <p className="font-soft text-3xl tracking-[0.2em] text-heading">482 913</p>
              <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">AES-256-GCM · expires in 4:59</p>
            </div>
          </Mock>
        </Cell>
        <Cell title="Unlock with Touch ID" body={<>Save your PIN once. Twinglass types it after <Tag icon={Fingerprint}>Touch ID</Tag>, on the lock screen and in apps that ask for it.</>} link={['Privacy policy', '/privacy']}>
          <Mock className="flex w-full items-center gap-4 p-4">
            <FrameCorners />
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full border border-primary/60 bg-primary/15 text-mark">
              <Fingerprint className="size-6" strokeWidth={1.5} />
            </span>
            <div>
              <p className="text-heading">Touch ID to unlock A024</p>
              <p className="mt-0.5 text-[12px] text-muted-foreground">Your saved PIN never leaves the keychain.</p>
            </div>
          </Mock>
        </Cell>
        <Cell title="Coding agents that test on your phone" body={<>An MCP server for <Tag logo={siClaude}>Claude Code</Tag>, <Tag logo={siCursor}>Cursor</Tag> and more, with 42 tools. Agents work on their own screen of the phone and check every step.</>} link={['Agent setup', `${DOCS}/AGENTS.md`]}>
          <Mock className="w-full font-mono text-[11.5px]">
            <FrameCorners />
            <p className="flex items-center gap-2 border-b border-input-border px-3 py-2 text-muted-foreground">
              <Bot className="size-3.5" /> agent screen · tool calls
            </p>
            {[
              ['launch_app', '“Your app”', '1.2 s'],
              ['set_text', 'email field', '✓ read back'],
              ['tap_element', '“Sign in”', '✓ 320 ms'],
              ['screen_map', 'Settings', '48 views'],
            ].map(([t, a, r]) => (
              <p key={t} className="flex gap-3 px-3 py-1.5">
                <span className="text-mark">{t}</span>
                <span className="text-heading">{a}</span>
                <span className="ml-auto text-ok">{r}</span>
              </p>
            ))}
          </Mock>
        </Cell>
        <Cell title="Both directions" body="Clipboard sync, drag files onto the mirror, share from any app on the phone straight to your Mac." link={['The phone app', '#phone']}>
          <Mock className="w-full divide-y divide-input-border">
            <FrameCorners />
            {(
              [
                [FileDown, 'photo.jpg', '→ Downloads/Twinglass', '2.4 MB'],
                [Clipboard, '“meeting at 4”', '→ phone clipboard', 'synced'],
                [Download, 'app-debug.apk', '→ installed on A024', '6.1 MB'],
              ] as [LucideIcon, string, string, string][]
            ).map(([Icon, n, d, m]) => (
              <p key={n} className="flex items-center gap-2.5 px-3 py-2.5">
                <Icon className="size-3.5 text-mark" />
                <span className="text-heading">{n}</span>
                <span className="hidden text-muted-foreground sm:inline">{d}</span>
                <span className="ml-auto font-mono text-[11px] text-muted-foreground">{m}</span>
              </p>
            ))}
          </Mock>
        </Cell>
      </BlurFade>
    </section>
  )
}

// ---------------------------------------------------------------- two ways to connect

export function Connect() {
  const modes = [
    {
      icon: Wifi,
      name: 'Wi-Fi, no setup',
      body: 'The Twinglass phone app shares the screen over your Wi-Fi, end-to-end encrypted. Nothing to turn on in Android.',
      needs: 'The phone app, the same Wi-Fi',
      gets: ['Mirroring', 'Taps, swipes and typing', 'Pair with a QR'],
    },
    {
      icon: Usb,
      name: 'Developer mode',
      body: 'The Mac talks to the phone through your own adb, over a cable or wireless debugging. The fastest path, and everything unlocks.',
      needs: 'USB debugging on, adb installed',
      gets: ['Lowest latency', 'Second screens', 'Touch ID unlock', 'All 42 agent tools'],
    },
  ]
  return (
    <section className={`pt-28 ${WRAP}`}>
      <H2>Two ways to connect.</H2>
      <p className="mt-4 max-w-xl text-lg">Start with Wi-Fi in a minute, and switch to Developer mode whenever you want everything. Neither goes through a server.</p>
      <div className="mt-12 grid gap-4 md:grid-cols-2">
        {modes.map((m, k) => (
          <BlurFade key={m.name} delay={k * 0.08} className="relative border border-border bg-tile p-7 sm:p-9">
            <FrameCorners />
            <m.icon className="size-6 text-mark" strokeWidth={1.6} />
            <h3 className="mt-5 text-2xl font-medium">{m.name}</h3>
            <p className="mt-2 text-sm leading-relaxed">{m.body}</p>
            <p className="mt-6 font-mono text-[11px] text-muted-foreground uppercase">You need</p>
            <p className="mt-1 text-sm text-heading">{m.needs}</p>
            <div className="mt-5 flex flex-wrap gap-1.5">
              {m.gets.map((g) => (
                <Chip key={g}>{g}</Chip>
              ))}
            </div>
          </BlurFade>
        ))}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- the phone app

export function PhoneApp() {
  const points: [LucideIcon, string, string][] = [
    [Smartphone, 'Knows where you stand', 'Home says whether you’re on Wi-Fi or at full potential, and the one step that gets you further.'],
    [Cpu, 'Device details', 'SoC, Android build, memory, battery health, cameras, sensors and codecs, in 12 searchable groups.'],
    [Download, 'Share to Mac', 'Send text, links, photos or files from any app’s share sheet.'],
    [RefreshCw, 'Updates from your Mac', 'The phone app never uses the internet. Your Mac brings each new version.'],
  ]
  return (
    <section id="phone" className={`pt-28 ${WRAP}`}>
      <div className="grid items-center gap-12 lg:grid-cols-2">
        <div className="min-w-0">
          <H2>A small phone app that makes it two-way.</H2>
          <p className="mt-4 max-w-lg text-lg leading-relaxed">
            2.9 MB, built with <Tag logo={siKotlin}>Kotlin</Tag> and <Tag logo={siJetpackcompose}>Jetpack Compose</Tag>. It powers Wi-Fi mode and adds what adb can’t do alone.
          </p>
          <div className="mt-10 grid gap-x-8 gap-y-7 sm:grid-cols-2">
            {points.map(([I, t, b], k) => (
              <BlurFade key={t} delay={k * 0.05}>
                <I className="size-5 text-mark" strokeWidth={1.6} />
                <p className="mt-3 font-medium text-heading">{t}</p>
                <p className="mt-1.5 text-sm leading-relaxed">{b}</p>
              </BlurFade>
            ))}
          </div>
        </div>
        <BlurFade className="relative flex justify-center overflow-hidden border border-border bg-tile pt-12">
          <Glow className="inset-0" />
          <div className="relative w-[15.5rem] rounded-t-[2.6rem] border border-b-0 border-input-border bg-[#050506] px-2 pt-2 shadow-[0_-20px_80px_-20px_rgb(124_92_255/0.6)] sm:w-[17rem]">
            <img src="/phone-app.webp" alt="The Twinglass phone app's Home screen" className="w-full rounded-t-[2.1rem]" width={565} height={1256} loading="lazy" />
          </div>
        </BlurFade>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- agents

export function Agents() {
  return (
    <section id="agents" className={`pt-28 ${WRAP}`}>
      <div className="grid items-stretch gap-12 lg:grid-cols-[1fr_1.1fr]">
        <div className="min-w-0">
          <H2>Let your agent test the app while you keep your phone.</H2>
          <p className="mt-4 max-w-lg text-lg">
            <Tag logo={siClaude}>Claude Code</Tag>, <Tag logo={siCursor}>Cursor</Tag>, <Tag icon={Code2}>VS Code</Tag> or any MCP client get 42 tools: see the screen, act on it,
            install and launch apps, read logs and crashes, measure jank.
          </p>
          <ul className="mt-8 flex flex-col gap-3 text-sm">
            {['Works on its own second screen, in a window you can watch', 'Waits for the screen to settle after every step', 'Checks that text and scrolls really happened', 'Off by default, local only, and can’t unlock without your Touch ID'].map((t) => (
              <li key={t} className="flex items-start gap-2.5 text-heading">
                <span className="mt-0.5">
                  <Ok />
                </span>
                {t}
              </li>
            ))}
          </ul>
          <div className="mt-8">
            <MoreLink href={`${DOCS}/AGENTS.md`}>All 42 tools</MoreLink>
          </div>
        </div>
        <BlurFade className="relative flex min-w-0 flex-col border border-border bg-tile p-3 sm:p-6">
          <FrameCorners />
          <Glow className="inset-0 opacity-70" />
          <div className="relative flex flex-1 flex-col border border-input-border bg-[#0d0d10]">
            <FrameCorners />
            <div className="flex items-center gap-2 border-b border-input-border px-4 py-2.5 font-mono text-[11px] text-muted-foreground">
              <Terminal className="size-3.5" /> Terminal
            </div>
            <Typewriter
              className="min-h-[16rem] flex-1 overflow-x-auto p-4 font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap text-heading"
              speed={14}
              text={'$ claude mcp add --transport http --scope user \\\n    mob-mirror http://127.0.0.1:38297/mcp \\\n    --header "Authorization: Bearer <token>"\n✓ Added mob-mirror\n\n> open my app and sign in as the test user\n\n  agent_screen   open              ✓ 1080×2400\n  launch_app     “Your app”        ✓ 1.2 s\n  set_text       email, password   ✓ read back\n  tap_element    “Sign in”         ✓ settled 320 ms\n  wait_for       “Welcome”         ✓ found\n\nSigned in as test@example.com. The home screen loaded\nin 1.8 s with no crashes in logcat.'}
            />
          </div>
          <p className="relative mt-3 text-xs text-muted-foreground">Settings → Agents → Copy Claude Code setup gives you this with your token filled in.</p>
        </BlurFade>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- more, as an icon grid

export function Capabilities() {
  const items: [LucideIcon, string, string][] = [
    [Command, '⌘K for your phone', 'Open any phone app by name or send it a link.'],
    [Clipboard, 'Clipboard history', 'Kept in memory only, and skips password managers.'],
    [FileDown, 'Drag and drop', 'APKs install; anything else lands on the phone.'],
    [Video, 'Screenshots and recordings', 'Saved to Pictures and Movies on your Mac.'],
    [AppWindow, 'Compact or full windows', 'Phone frames, always on top, tile them all.'],
    [Bell, 'Menu bar', 'Every phone and its battery, one click away.'],
    [MousePointerClick, 'Keyboard shortcuts', 'Back, Home, volume, power, rotate, quick settings.'],
    [RefreshCw, 'Updates itself', 'Verified downloads, and the phone app comes along.'],
  ]
  return (
    <section className={`pt-28 ${WRAP}`}>
      <H2>And the little things.</H2>
      <div className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
        {items.map(([I, t, b], k) => (
          <BlurFade key={t} delay={(k % 4) * 0.04}>
            <I className="size-5 text-mark" strokeWidth={1.6} />
            <p className="mt-3 font-medium text-heading">{t}</p>
            <p className="mt-1 text-sm leading-relaxed">{b}</p>
          </BlurFade>
        ))}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- privacy

export function PrivacyBlock() {
  const items: [LucideIcon, string, string][] = [
    [ShieldCheck, 'No accounts, no analytics', 'Nothing to sign up for. The only internet request is the update check.'],
    [Lock, 'Encrypted Wi-Fi link', 'Paired with a 6-digit code, then AES-256-GCM on every frame.'],
    [KeyRound, 'Your PIN behind Touch ID', 'Saved PINs stay encrypted in your keychain.'],
    [Unlink, 'Forget works both ways', 'Forget on the Mac or the phone and the other side forgets too.'],
    [SlidersHorizontal, 'You decide what the Mac reads', 'Device details, app icons and agent access switch off on the phone.'],
    [Bot, 'Agents are opt-in', 'Off by default, localhost only, behind a token.'],
  ]
  return (
    <section id="privacy" className={`pt-28 ${WRAP}`}>
      <H2>Private by default.</H2>
      <p className="mt-4 text-lg">Your phone stays between your phone and your Mac.</p>
      <div className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(([I, t, b], k) => (
          <BlurFade key={t} delay={(k % 3) * 0.05}>
            <I className="size-5 text-mark" strokeWidth={1.6} />
            <p className="mt-3 font-medium text-heading">{t}</p>
            <p className="mt-1 text-sm leading-relaxed">{b}</p>
          </BlurFade>
        ))}
      </div>
      <div className="mt-10 flex flex-wrap gap-2">
        <HoverButton href="/privacy">Privacy policy</HoverButton>
        <GhostLink href={REPO}>Source on GitHub</GhostLink>
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
      <BlurFade className="relative grid gap-8 border border-border bg-tile p-7 sm:p-10 lg:grid-cols-[1fr_1.6fr]">
        <FrameCorners />
        <div>
          <p className="font-mono text-[11px] text-muted-foreground uppercase">
            What’s new · v{r.version} · {r.date}
          </p>
          <h2 className="font-soft mt-3 text-3xl leading-tight">{r.title}</h2>
          <p className="mt-3 text-sm leading-relaxed">{r.summary}</p>
          <div className="mt-5 flex flex-col gap-1">
            {older.map((o) => (
              <span key={o.version} className="font-mono text-[11px] text-muted-foreground">
                v{o.version} · {o.title}
              </span>
            ))}
          </div>
          <div className="mt-5">
            <MoreLink href={`${REPO}/blob/master/CHANGELOG.md`}>Full changelog</MoreLink>
          </div>
        </div>
        <ul className="grid content-start gap-2.5 text-sm">
          {[...r.mac, ...r.phoneApp].slice(0, 7).map((l) => (
            <li key={l} className="flex gap-2.5 text-heading/90">
              <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-mark" />
              <span>{l}</span>
            </li>
          ))}
        </ul>
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
        <H2>Questions.</H2>
        <div className="divide-y divide-border border-y border-border">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group py-1 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-medium text-heading">
                {q}
                <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-300 group-open:rotate-180" />
              </summary>
              <p className="pb-5 text-sm leading-relaxed">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- closing call to action + download

// Labelled pills on both sides of the download box: they slide in from the edges as the section
// scrolls in, then drift at slightly different speeds (parallax) and float gently. Built with
// motion's useScroll / useTransform; still for reduced motion.
const PILLS: { icon: LucideIcon; label: string; side: 'l' | 'r'; y: number; x: number; depth: number }[] = [
  { icon: Smartphone, label: 'Android 10+', side: 'l', y: 14, x: 2, depth: 0.6 },
  { icon: Wifi, label: 'Wi-Fi, no setup', side: 'l', y: 36, x: 0, depth: 1 },
  { icon: Fingerprint, label: 'Touch ID unlock', side: 'l', y: 60, x: 3, depth: 0.75 },
  { icon: Layers, label: 'Second screens', side: 'l', y: 83, x: 0.5, depth: 1.2 },
  { icon: Bot, label: 'Coding agents', side: 'r', y: 18, x: 0.5, depth: 1.1 },
  { icon: Command, label: '⌘K palette', side: 'r', y: 41, x: 3, depth: 0.7 },
  { icon: Terminal, label: 'One-line install', side: 'r', y: 64, x: 0, depth: 1 },
  { icon: Usb, label: 'USB or wireless', side: 'r', y: 87, x: 2, depth: 0.65 },
]

function Pill({ p, k, progress }: { p: (typeof PILLS)[number]; k: number; progress: MotionValue<number> }) {
  const dir = p.side === 'l' ? -1 : 1
  const enter = useTransform(progress, [0.06, 0.36], [1, 0], { clamp: true })
  const x = useTransform(enter, (e) => e * dir * 220)
  const y = useTransform(progress, [0.2, 1], [0, -90 * p.depth])
  const opacity = useTransform(progress, [0.06, 0.3], [0, 1])
  return (
    <motion.div aria-hidden style={{ x, y, opacity, top: `${p.y}%`, [p.side === 'l' ? 'left' : 'right']: `${p.x}%` }} className="absolute hidden lg:block">
      <div
        className="relative flex -translate-y-1/2 animate-[floaty_6s_ease-in-out_infinite] items-center gap-2 border border-input-border bg-tile/90 px-3 py-2 text-[13px] whitespace-nowrap text-heading shadow-[0_10px_30px_-12px_rgb(124_92_255/0.7)] backdrop-blur motion-reduce:animate-none"
        style={{ animationDelay: `${k * -0.8}s` }}
      >
        <FrameCorners />
        <span className="flex size-6 items-center justify-center rounded-[4px] bg-primary/15 text-mark">
          <p.icon className="size-3.5" strokeWidth={1.8} />
        </span>
        {p.label}
      </div>
    </motion.div>
  )
}

export function DownloadSection() {
  const ref = useRef<HTMLDivElement>(null)
  const still = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] })
  const fixed = useMotionValue(0.5)
  const progress = still ? fixed : scrollYProgress
  const glow = useTransform(progress, [0.1, 0.45], [0.15, 1])
  const scale = useTransform(progress, [0.08, 0.4], [0.94, 1], { clamp: true })
  const lift = useTransform(progress, [0.08, 0.4], [50, 0], { clamp: true })
  return (
    <section id="download" className={`pt-28 ${WRAP}`}>
      <div ref={ref} className="relative py-10 lg:px-52 lg:py-16 xl:px-56">
        <motion.div style={{ opacity: glow }} className="absolute -inset-x-16 inset-y-0 [mask-image:radial-gradient(ellipse_60%_55%_at_50%_60%,black_30%,transparent_75%)]">
          <Glow className="inset-0 [background:radial-gradient(ellipse_70%_60%_at_50%_70%,rgb(124_92_255/0.6),rgb(91_108_255/0.2)_45%,transparent_75%)]" />
        </motion.div>
        {PILLS.map((p, k) => (
          <Pill key={p.label} p={p} k={k} progress={progress} />
        ))}
        <motion.div style={{ scale, y: lift }} className="relative mx-auto max-w-2xl">
          <DownloadPanel />
        </motion.div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- footer

export function Footer() {
  const link = 'flex min-h-8 items-center gap-1 text-sm hover:text-heading'
  const out = (href: string, label: string) => (
    <li key={label}>
      <a href={href} target="_blank" rel="noopener noreferrer" className={link}>
        {label} <ArrowUpRight className="size-3" />
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
  const col = (title: string, items: ReactNode) => (
    <nav aria-label={title} className="flex flex-col gap-3">
      <h2 className="text-sm font-medium">{title}</h2>
      <ul>{items}</ul>
    </nav>
  )
  return (
    <footer className={`mt-32 pb-10 ${WRAP}`}>
      <div className="relative border border-border px-6 py-10 sm:px-10">
        <FrameCorners />
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
          <div className="col-span-2 flex max-w-sm flex-col gap-3 lg:col-span-1">
            <span className="flex items-center gap-2 font-semibold text-heading">
              <img src="/icon.png" alt="" className="size-5 rounded-[5px]" /> Twinglass
            </span>
            <p className="text-sm">An indie Mac app for people who work next to an Android phone. No accounts, no analytics.</p>
          </div>
          {col('Product', [local('/#features', 'Features'), local('/#how', 'How it works'), local('/#agents', 'For agents'), local('/#download', 'Download')])}
          {col('Project', [out(REPO, 'GitHub'), out(`${REPO}/releases`, 'Releases'), out(`${REPO}/blob/master/CHANGELOG.md`, 'Changelog')])}
          {col('Help & legal', [local('/privacy', 'Privacy Policy'), out(`${REPO}/issues/new`, 'Report a problem'), out(`${DOCS}/AGENTS.md`, 'Agent setup')])}
        </div>
        <p className="mt-12 text-xs text-muted-foreground">
          © 2026 Nikhil Kumawat · Built on{' '}
          <a href="https://github.com/Genymobile/scrcpy" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-heading">
            scrcpy
          </a>
          . Not affiliated with Google or Genymobile. Android is a trademark of Google LLC.
        </p>
      </div>
    </footer>
  )
}
