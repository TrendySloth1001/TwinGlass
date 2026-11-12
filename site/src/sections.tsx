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
  CloudOff,
  Command,
  Cpu,
  Download,
  FileDown,
  Fingerprint,
  KeyRound,
  Laptop,
  Layers,
  Lock,
  Keyboard,
  MonitorSmartphone,
  MousePointerClick,
  Plus,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Terminal,
  Unlink,
  Usb,
  Video,
  Wifi,
  type LucideIcon,
} from 'lucide-react'
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useScroll, useTransform, type MotionValue } from 'motion/react'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import {
  siAndroid,
  siApple,
  siClaude,
  siCursor,
  siElectron,
  siElectronbuilder,
  siGithub,
  siGnubash,
  siGoogle,
  siGradle,
  siHomebrew,
  siJetpackcompose,
  siKotlin,
  siLucide,
  siMaterialdesign,
  siModelcontextprotocol,
  siNodedotjs,
  siRadixui,
  siReact,
  siShadcnui,
  siSimpleicons,
  siTailwindcss,
  siTypescript,
  siVercel,
  siVite,
  siVitest,
  siZod,
  type SimpleIcon,
} from 'simple-icons'
import { Chip, CopyInline, FrameCorners, GhostLink, HoverButton, REPO, RELEASES, Tag } from './components/base'
import { DownloadPanel, useDownload } from './components/download'
import { BlurFade, Typewriter } from './components/fx'
import { TOOL_INFO } from './pages/Tools'

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

/** A brand logo set inside a headline: a small tile sized to the letters, sitting on the baseline. */
function HeadLogo({ logo, color }: { logo: { path: string; title: string }; color: string }) {
  return (
    <span
      aria-hidden
      className="mx-[0.04em] inline-flex size-[0.82em] -translate-y-[0.06em] items-center justify-center rounded-[0.16em] border border-input-border bg-input align-middle shadow-[0_0.1em_0.4em_-0.1em_rgb(124_92_255/0.5)]"
    >
      <svg viewBox="0 0 24 24" className="size-[0.52em]" fill={color}>
        <path d={logo.path} />
      </svg>
    </span>
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

const HERO_LINES: [LucideIcon, string][] = [
  [MonitorSmartphone, 'Mirror it.'],
  [Keyboard, 'Control it from your keyboard.'],
  [Layers, 'Open a second screen.'],
  [Fingerprint, 'Unlock it with Touch ID.'],
  [Bot, 'Let agents test on it.'],
]
const HERO_STEP_MS = 2800

/** What Twinglass does, one line at a time: an icon and a phrase slide in together. Hovering pauses; still for reduced motion. */
function HeroRotator() {
  const [i, setI] = useState(0)
  const [paused, setPaused] = useState(false)
  const still = useReducedMotion()
  useEffect(() => {
    if (paused || still) return
    const t = setTimeout(() => setI((n) => (n + 1) % HERO_LINES.length), HERO_STEP_MS)
    return () => clearTimeout(t)
  }, [i, paused, still])
  const [Icon, line] = HERO_LINES[i]!
  return (
    <span className="mb-4 block" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <span className="relative flex h-9 items-center overflow-hidden" aria-live="polite">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={line}
            initial={{ y: 24, opacity: 0, filter: 'blur(4px)' }}
            animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
            exit={{ y: -24, opacity: 0, filter: 'blur(4px)' }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-center gap-2.5"
          >
            <Icon className="size-5 shrink-0 text-mark" strokeWidth={1.8} />
            <span className="text-xl font-medium text-heading">{line}</span>
          </motion.span>
        </AnimatePresence>
      </span>
    </span>
  )
}

/** Where the collage's cards sit on large screens: left, top, width, height. */
const COLLAGE: Record<string, [string, string, string, string]> = {
  mac: ['57%', '0px', '43%', '470px'],
  phone: ['0%', '260px', '25%', '580px'],
  agent: ['27%', '220px', '28%', '270px'],
  unlock: ['27%', '515px', '28%', '220px'],
  wifi: ['57%', '500px', '20%', '250px'],
  second: ['79%', '500px', '21%', '330px'],
}

/**
 * The blueprint grid: long dashed lines along every card's edges, running past its corners. Drawn
 * once, under all the cards (which are opaque), so no line ever crosses a card or its image.
 */
function Guides() {
  const line = 'absolute border-dashed border-border'
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0 hidden lg:block">
      {Object.entries(COLLAGE).map(([k, [l, t, w, h]]) => (
        <span key={k} className="absolute" style={{ left: l, top: t, width: w, height: h }}>
          <span className={`${line} -inset-x-24 top-0 border-t`} />
          <span className={`${line} -inset-x-24 bottom-0 border-b`} />
          <span className={`${line} -inset-y-24 left-0 border-l`} />
          <span className={`${line} -inset-y-24 right-0 border-r`} />
        </span>
      ))}
    </div>
  )
}

/** One collage card. On large screens it's placed by --l/--t/--w/--h; on small ones it flows. */
function Piece({ at, className = '', delay = 0, children }: { at: keyof typeof COLLAGE; className?: string; delay?: number; children: ReactNode }) {
  const [l, t, w, h] = COLLAGE[at]!
  return (
    <BlurFade
      delay={delay}
      className="relative z-10 lg:absolute lg:top-[var(--t)] lg:left-[var(--l)] lg:h-[var(--h)] lg:w-[var(--w)]"
      style={{ '--l': l, '--t': t, '--w': w, '--h': h } as CSSProperties}
    >
      <div className={`relative h-full border border-border bg-tile ${className}`}>
        <FrameCorners />
        {children}
      </div>
    </BlurFade>
  )
}

/** The hero's product collage: the Mac app, the phone app and what they do, laid out on a dashed grid. */
function HeroCollage() {
  return (
    <div className="relative mt-16 flex flex-col gap-4 lg:block lg:h-[860px]">
      <Guides />
      {/* Intro, top left (the reference layout's headline slot). */}
      <BlurFade delay={0.1} className="relative z-10 lg:absolute lg:top-0 lg:left-0 lg:w-[52%] lg:bg-background lg:pt-6 lg:pr-6 lg:pb-8">
        <h2 className="font-soft text-3xl leading-tight text-heading sm:text-[2.1rem]">
          Mirror it, drive it,
          <br />
          or hand it to your <span className="text-mark">AI agent.</span>
        </h2>
        <p className="mt-4 max-w-md text-[15px] leading-relaxed">
          A VS Code-style workbench on your Mac, a small app on your phone, and 42 tools so <Tag logo={siClaude}>Claude Code</Tag>,{' '}
          <Tag logo={siCursor}>Cursor</Tag> or any MCP client can test on it.
        </p>
      </BlurFade>

      {/* The Mac app on a violet glow. */}
      <Piece at="mac" delay={0.15} className="min-h-[360px] overflow-hidden sm:min-h-[460px] lg:min-h-0">
        <Glow className="inset-0 opacity-90 [background:radial-gradient(ellipse_90%_80%_at_50%_100%,rgb(124_92_255/0.8),rgb(70_60_200/0.35)_45%,transparent_75%)]" />
        <div className="relative flex items-center justify-between px-5 pt-4 text-[12px] text-muted-foreground">
          <span className="flex items-center gap-2 font-medium text-heading">
            <img src="/icon.png" alt="" className="size-4 rounded-[4px]" /> Twinglass for Mac
          </span>
          <span className="font-mono text-[11px]">workbench</span>
        </div>
        <p className="relative px-5 pt-3 text-[22px] leading-tight font-medium text-heading">Your phone, as a tab.</p>
        <div className="absolute inset-x-5 bottom-0 top-[110px] overflow-hidden rounded-t-[10px] border border-b-0 border-border bg-background shadow-2xl lg:inset-x-6">
          <div className="flex h-5 items-center gap-1.5 border-b border-border px-2.5">
            <span className="size-2 rounded-full bg-[#ff5f57]" />
            <span className="size-2 rounded-full bg-[#febc2e]" />
            <span className="size-2 rounded-full bg-[#28c840]" />
          </div>
          {/* The app in the site's own theme. */}
          <img src="/app-workbench-dark.jpg" alt="Twinglass for Mac: phones in a side bar, the Welcome tab and a status bar" width={1600} height={1220} className="only-dark w-full" loading="eager" />
          <img src="/app-workbench-light.jpg" alt="Twinglass for Mac in the light theme" width={1600} height={1220} className="only-light w-full" loading="eager" />
        </div>
      </Piece>

      {/* The phone app. */}
      <Piece at="phone" delay={0.2} className="overflow-hidden">
        <div className="p-5">
          <p className="flex items-center gap-2 text-[13px] font-medium text-heading">
            <Smartphone className="size-4 text-mark" /> The phone app
          </p>
          <p className="mt-1 text-[13px] leading-snug">Pairs with a QR, sends files and clipboard, and shows what your Mac may read.</p>
        </div>
        <div className="relative mx-auto mt-1 w-[60%] max-w-[220px] overflow-hidden lg:w-[78%] lg:max-w-[260px] rounded-[26px] border-[5px] border-black bg-black shadow-2xl [mask-image:linear-gradient(to_bottom,black_70%,transparent)]">
          <img src="/phone-app-dark.jpg" alt="The Twinglass phone app" width={620} height={1304} className="only-dark w-full" loading="lazy" />
          <img src="/phone-app-light.jpg" alt="The Twinglass phone app in the light theme" width={620} height={1304} className="only-light w-full" loading="lazy" />
        </div>
      </Piece>

      {/* An agent working on its own screen. */}
      <Piece at="agent" delay={0.25}>
        <div className="flex h-full flex-col p-5">
          <p className="flex items-center gap-2 text-[13px] font-medium text-heading">
            <Bot className="size-4 text-mark" /> Agents get their own screen
          </p>
          <div className="mt-4 flex-1 space-y-1.5 border border-border bg-input/70 p-3 font-mono text-[11.5px] leading-relaxed">
            <p className="text-muted-foreground">agent · second screen</p>
            <p className="text-heading">launch_app “Settings”</p>
            <p className="text-heading">tap_element “Display”</p>
            <p className="text-heading">set_device_state dark_mode=on</p>
            <p className="text-ok">✓ settled in 320 ms · screenshot saved</p>
          </div>
          <p className="mt-3 text-[12px]">You keep using your phone meanwhile.</p>
        </div>
      </Piece>

      {/* Unlock. */}
      <Piece at="unlock" delay={0.3}>
        <div className="flex h-full flex-col justify-between p-5">
          <span className="flex size-12 items-center justify-center rounded-full border border-border bg-input">
            <Fingerprint className="size-6 text-mark" strokeWidth={1.6} />
          </span>
          <div>
            <p className="text-[15px] font-medium text-heading">Unlock with Touch ID</p>
            <p className="mt-1 text-[13px] leading-snug">Your PIN stays in the Mac’s keychain. Agents can’t unlock without your finger.</p>
          </div>
        </div>
      </Piece>

      {/* Wi-Fi, no setup. */}
      <Piece at="wifi" delay={0.35} className="overflow-hidden">
        <div className="relative flex h-[130px] items-center justify-center">
          {[0, 1, 2].map((k) => (
            <span
              key={k}
              aria-hidden
              className="absolute size-16 rounded-full border border-mark/40 motion-safe:animate-ping"
              style={{ animationDelay: `${k * 0.6}s`, animationDuration: '2.4s' }}
            />
          ))}
          <span className="relative flex size-11 items-center justify-center rounded-full bg-mark/15">
            <Wifi className="size-5 text-mark" />
          </span>
        </div>
        <div className="px-5 pb-5">
          <p className="text-[15px] font-medium text-heading">Wi-Fi, no setup</p>
          <p className="mt-1 text-[13px] leading-snug">Scan a code once. No cable, no developer options.</p>
        </div>
      </Piece>

      {/* Second screens. */}
      <Piece at="second" delay={0.4}>
        <div className="flex h-full flex-col p-5">
          <p className="flex items-center gap-2 text-[13px] font-medium text-heading">
            <Layers className="size-4 text-mark" /> Second screens
          </p>
          <div className="relative mt-4 flex-1">
            <div className="absolute top-0 left-0 h-[78%] w-[52%] rounded-[12px] border-[3px] border-black bg-gradient-to-b from-[#2a2346] to-[#120f1f] shadow-xl" />
            <div className="absolute right-0 bottom-0 flex h-[78%] w-[52%] flex-col gap-1.5 rounded-[12px] border-[3px] border-black bg-[#1f1f1f] p-2 shadow-xl">
              <span className="h-2 w-2/3 rounded-full bg-white/25" />
              <span className="h-2 w-1/2 rounded-full bg-white/15" />
              <span className="mt-auto h-6 rounded-[5px] bg-mark/70" />
            </div>
          </div>
          <p className="mt-3 text-[12px] leading-snug">Run another app on a screen of its own, next to your phone’s.</p>
        </div>
      </Piece>
    </div>
  )
}

export function Hero() {
  const { openDownload, latest } = useDownload()
  return (
    <section className={`pt-28 sm:pt-32 ${WRAP}`}>
      <BlurFade>
        <a href={`/changelog#v${latest.version}`} className="inline-flex items-center gap-2 text-sm text-foreground hover:text-heading">
          <Chip dot>New</Chip>
          {RELEASES[0]?.title} in {latest.version}
          <ChevronRight className="size-3.5" />
        </a>
      </BlurFade>
      <BlurFade delay={0.05}>
        <h1 className="font-soft mt-6 max-w-5xl text-[2.9rem] leading-[1.08] text-balance sm:text-6xl lg:text-[4.5rem]">
          Your <HeadLogo logo={siAndroid} color="#3ddc84" /> Android phone, on your <HeadLogo logo={siApple} color="currentColor" /> Mac.
        </h1>
      </BlurFade>
      <BlurFade delay={0.1}>
        <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <p className="max-w-xl text-lg text-pretty">
            <HeroRotator />

            Any <Tag logo={siAndroid}>Android</Tag> phone on your <Tag logo={siApple}>Mac</Tag>, over a <Tag icon={Usb}>USB</Tag> cable, wireless debugging, or
            plain <Tag icon={Wifi}>Wi-Fi</Tag> with no developer options. Free.
          </p>
          <div className="flex flex-wrap gap-2">
            <HoverButton onClick={openDownload}>Download for Mac</HoverButton>
            <GhostLink href={REPO}>View on GitHub</GhostLink>
          </div>
        </div>
      </BlurFade>

      <HeroCollage />
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
                  <span key={k} className="aspect-square rounded-[4px] bg-foreground/10" />
                ))}
              </div>
            </Mock>
            <Mock className="h-36 flex-[1.4] border-primary/60 p-2.5">
              <FrameCorners />
              <p className="flex items-center justify-between font-mono text-[10.5px] text-mark">
                second screen <Layers className="size-3" />
              </p>
              <div className="mt-2 space-y-1.5">
                <span className="block h-2 w-3/4 rounded-sm bg-foreground/15" />
                <span className="block h-2 w-1/2 rounded-sm bg-foreground/10" />
                <span className="block h-14 rounded-sm bg-primary/20" />
              </div>
            </Mock>
          </div>
        </Cell>
        <Cell title="Wi-Fi, with no setup" body={<>Scan the <Tag icon={QrCode}>QR</Tag> on your Mac. The phone app downloads straight from the Mac, pairs with a code and mirrors, encrypted with <Tag icon={Lock}>AES-256-GCM</Tag>.</>} link={['Pairing and encryption', `${DOCS}/ARCHITECTURE.md`]}>
          <Mock className="flex w-full items-center gap-5 p-4">
            <FrameCorners />
            <div className="grid size-16 shrink-0 grid-cols-6 gap-px bg-white p-1">
              {'101101011010110011001101101001011101101100110110'.split('').map((b, k) => (
                <span key={k} className={b === '1' ? 'bg-black' : 'bg-white'} />
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
        <Cell title="Coding agents that test on your phone" body={<>An MCP server for <Tag logo={siClaude}>Claude Code</Tag>, <Tag logo={siCursor}>Cursor</Tag> and more, with <a href="/tools" className="text-heading underline underline-offset-2 hover:text-mark">42 tools</a>. Agents work on their own screen of the phone and check every step.</>} link={['Agent setup', `${DOCS}/AGENTS.md`]}>
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
      <div className="grid items-stretch gap-12 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col">
          <H2>A small phone app that makes it two-way.</H2>
          <p className="mt-4 max-w-lg text-lg leading-relaxed">
            2.9 MB, built with <Tag logo={siKotlin}>Kotlin</Tag> and <Tag logo={siJetpackcompose}>Jetpack Compose</Tag>. It powers Wi-Fi mode and adds what adb can’t do alone.
          </p>
          <div className="relative mt-10 grid border-t border-l border-border sm:grid-cols-2 lg:mt-auto">
            <FrameCorners />
            {points.map(([I, t, b], k) => (
              <BlurFade key={t} delay={k * 0.05} className="border-r border-b border-border p-5 sm:p-6">
                <span className="flex size-9 items-center justify-center border border-input-border bg-input text-mark">
                  <I className="size-[17px]" strokeWidth={1.6} />
                </span>
                <p className="mt-4 font-medium text-heading">{t}</p>
                <p className="mt-1.5 text-sm leading-relaxed">{b}</p>
              </BlurFade>
            ))}
          </div>
        </div>
        <BlurFade className="relative flex min-h-[34rem] border border-border bg-tile">
          <FrameCorners />
          {/* The phone rises from the bottom and fades out there, inside its own clipped area. */}
          <div className="relative flex flex-1 items-end justify-center overflow-hidden pt-12">
            <Glow className="inset-0" />
            <div className="relative w-[15.5rem] rounded-t-[2.6rem] border border-b-0 border-input-border bg-[#050506] px-2 pt-2 shadow-[0_-20px_80px_-20px_rgb(124_92_255/0.6)] [mask-image:linear-gradient(to_bottom,black_70%,transparent)] sm:w-[17rem]">
              <img src="/phone-app-dark.jpg" alt="The Twinglass phone app's Home screen" className="only-dark w-full rounded-t-[2.1rem]" width={620} height={1304} loading="lazy" />
              <img src="/phone-app-light.jpg" alt="The Twinglass phone app's Home screen in the light theme" className="only-light w-full rounded-t-[2.1rem]" width={620} height={1304} loading="lazy" />
            </div>
          </div>
          {/* What you're looking at, pointed out. */}
          <span className="absolute top-[30%] left-4 hidden items-center gap-2 border border-input-border bg-tile/95 px-2.5 py-1.5 text-xs text-heading shadow-lg backdrop-blur sm:flex">
            <span className="size-1.5 animate-pulse rounded-full bg-ok" /> Live link status
          </span>
          <span className="absolute right-4 bottom-[22%] hidden items-center gap-2 border border-input-border bg-tile/95 px-2.5 py-1.5 text-xs text-heading shadow-lg backdrop-blur sm:flex">
            <Cpu className="size-3.5 text-mark" /> 12 detail groups
          </span>
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
            <Tag logo={siClaude}>Claude Code</Tag>, <Tag logo={siCursor}>Cursor</Tag>, <Tag icon={Code2}>VS Code</Tag> or any MCP client get <a href="/tools" className="text-heading underline underline-offset-2 hover:text-mark">42 tools</a>: see the screen, act on it,
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
            <MoreLink href="/tools">All 42 tools</MoreLink>
          </div>
        </div>
        <BlurFade className="relative flex min-w-0 flex-col border border-border bg-tile p-3 sm:p-6">
          <FrameCorners />
          <Glow className="inset-0 opacity-70" />
          {/* A terminal stays dark in both themes. */}
          <div className="relative flex flex-1 flex-col border border-term-border bg-term">
            <FrameCorners />
            <div className="flex items-center gap-2 border-b border-term-border px-4 py-2.5 font-mono text-[11px] text-term-fg/55">
              <Terminal className="size-3.5" /> Terminal
            </div>
            <Typewriter
              className="min-h-[16rem] flex-1 overflow-x-auto p-4 font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap text-term-fg [&_span[aria-hidden]]:bg-term-fg/70"
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

// ---------------------------------------------------------------- a story of Nikhil

/** An MCP tool name inside the story. */
function T({ children }: { children: string }) {
  const tool = TOOL_INFO.get(children)
  const Icon = tool?.icon
  const [shift, setShift] = useState(0)
  // Centre the tooltip on the chip, nudged so it never runs off either side of the window.
  const place = (e: { currentTarget: HTMLElement }) => {
    const r = e.currentTarget.getBoundingClientRect()
    const w = Math.min(256, window.innerWidth - 16)
    const left = r.left + r.width / 2 - w / 2
    setShift(Math.max(8 - left, Math.min(0, window.innerWidth - 8 - (left + w))))
  }
  return (
    // Hover or focus shows what the tool does (same icon and words as /tools).
    <span tabIndex={tool ? 0 : undefined} onMouseEnter={place} onFocus={place} className="group/t relative inline-block outline-none">
      <code className="mx-px inline-flex items-center gap-[0.3em] rounded-[3px] border border-primary/35 bg-primary/10 px-[0.35em] py-[0.08em] align-[-0.06em] font-mono text-[0.84em] leading-snug whitespace-nowrap text-mark transition-colors group-hover/t:border-primary/70 group-hover/t:bg-primary/20 group-focus-visible/t:border-primary/70">
        {Icon && <Icon aria-hidden className="size-[1em] shrink-0" />}
        {children}
      </code>
      {tool && (
        <span
          role="tooltip"
          style={{ marginLeft: shift }}
          className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-[min(16rem,calc(100vw-1rem))] -translate-x-1/2 translate-y-1 border border-input-border bg-background p-3 text-left font-sans text-[13px] leading-snug font-normal whitespace-normal text-foreground opacity-0 shadow-[0_16px_40px_-12px_rgb(0_0_0/0.6)] backdrop-blur-xl transition-all duration-150 group-hover/t:translate-y-0 group-hover/t:opacity-100 group-focus-visible/t:translate-y-0 group-focus-visible/t:opacity-100"
        >
          <span className="mb-1 flex items-center gap-1.5 font-mono text-xs text-heading">
            {Icon && <Icon aria-hidden className="size-3.5 text-mark" />}
            {children}
          </span>
          {tool.what}
        </span>
      )}
    </span>
  )
}

const STORY_TOOLS = [
  'list_devices', 'agent_screen', 'install_apk', 'app_info', 'launch_app', 'get_ui_tree', 'find_elements', 'set_text', 'tap_element', 'wait_for',
  'screen_map', 'set_device_state', 'scroll', 'swipe', 'screenshot', 'record_screen', 'get_crashes', 'logcat', 'app_performance', 'start_activity',
  'clear_app_data', 'set_permission', 'reverse_port', 'unlock_phone', 'get_notifications', 'pull_file', 'press_key', 'stop_app', 'device_info', 'type_text', 'run_steps',
]

export function Story() {
  const [open, setOpen] = useState(false)
  const [settled, setSettled] = useState(false)
  return (
    <section id="story" className={`pt-28 ${WRAP}`}>
      <BlurFade className="relative grid gap-10 border border-border bg-tile p-7 sm:p-10 lg:grid-cols-[15rem_1fr]">
        <FrameCorners />
        <div className="flex flex-row items-center gap-4 lg:flex-col lg:items-start">
          <img src="https://github.com/TrendySloth1001.png?size=192" alt="Nikhil Kumawat" width={96} height={96} className="size-16 rounded-full border border-input-border lg:size-24" loading="lazy" />
          <div>
            <p className="font-mono text-[11px] text-muted-foreground uppercase">The story of me</p>
            <p className="mt-1 font-medium text-heading">Nikhil Kumawat</p>
            <a href="https://github.com/TrendySloth1001" target="_blank" rel="noopener noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-sm text-mark hover:underline">
              @TrendySloth1001 <ArrowUpRight className="size-3.5" />
            </a>
            <p className="mt-3 hidden text-xs leading-relaxed lg:block">Builds Twinglass. Spends most of his time on the flow people actually take through a product.</p>
            <span className="mt-4 hidden lg:inline-block">
              <Chip dot>{STORY_TOOLS.length} tools in this story</Chip>
            </span>
          </div>
        </div>

        <div className="min-w-0">
          <h2 className="font-soft text-3xl leading-tight sm:text-4xl">The night I stopped being my own test runner.</h2>
          <div className="mt-6 flex flex-col gap-4 text-[15.5px] leading-[1.9]">
            <p>
              I built the MCP server because I was tired of tapping through my own app after every change. One evening I asked Claude Code to check a new
              sign-in flow while I kept replying on WhatsApp, on the same phone. It called <T>list_devices</T>, found my A024, checked it with{' '}
              <T>device_info</T>, then opened its own <T>agent_screen</T> and got to work there. My screen didn’t even flicker.
            </p>
            <AnimatePresence initial={false}>
              {open && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  // Clip only while it opens or closes, so the tool tooltips can rise above it.
                  onAnimationStart={() => setSettled(false)}
                  onAnimationComplete={() => setSettled(open)}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  className={`flex flex-col gap-4 ${settled ? '' : 'overflow-hidden'}`}
                >
                  <p>
                    The agent used <T>install_apk</T> to put the debug build on, <T>app_info</T> to make sure it was the right version, and <T>launch_app</T> to open it.
                    Instead of guessing from pictures, it read the screen with <T>get_ui_tree</T> and <T>find_elements</T>, filled the form with <T>set_text</T>{' '}
                    (and <T>type_text</T> for the one field that fought back), and pressed buttons with <T>tap_element</T>. Between steps it waited with{' '}
                    <T>wait_for</T> until “Welcome” appeared, and the boring part, sign out and sign in again, it batched into one <T>run_steps</T>.
                  </p>
                  <p>
                    Then it got picky. <T>screen_map</T> measured every view in dp and caught a gap that was 14 where my design said 16. It used{' '}
                    <T>set_device_state</T> to switch on dark mode and the largest font size, went through every screen with <T>scroll</T> and <T>swipe</T>, and took
                    a <T>screenshot</T> of each one. <T>record_screen</T> saved a video I watched the next morning.
                  </p>
                  <p>
                    When the app crashed on a slow connection, <T>get_crashes</T> and <T>logcat</T> had the stack trace before I’d asked. <T>app_performance</T>{' '}
                    showed janky frames on the feed, and <T>start_activity</T> timed the cold start. It reset things with <T>clear_app_data</T>, tried the
                    permission prompts with <T>set_permission</T>, and pointed the app at the dev server on my Mac with <T>reverse_port</T>.
                  </p>
                  <p>
                    By then my phone had locked itself. <T>unlock_phone</T> asked for my Touch ID on the Mac, never my PIN. It checked the test push landed with{' '}
                    <T>get_notifications</T>, grabbed the exported log with <T>pull_file</T>, went back with <T>press_key</T>, closed the app with{' '}
                    <T>stop_app</T>, and closed its own screen. I hadn’t put my phone down once.
                  </p>
                  <p className="text-heading">
                    That’s the whole idea: your agent gets its own screen and real tools, and you keep your phone.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpen((o) => !o)}
              className="inline-flex h-9 items-center gap-1.5 rounded-[4px] border border-input-border bg-input px-3.5 text-sm font-medium text-heading transition-colors hover:bg-muted"
            >
              {open ? 'Show less' : 'Read the whole story'}
              <ChevronDown className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            <MoreLink href="/tools">Every tool, explained</MoreLink>
          </div>
        </div>
      </BlurFade>
    </section>
  )
}

// ---------------------------------------------------------------- the little things

export function Capabilities() {
  const items: [LucideIcon, string, string, ReactNode][] = [
    [Command, '⌘K for your phone', 'Open any phone app by name or send it a link.', <kbd className="font-mono">⌘K</kbd>],
    [Clipboard, 'Clipboard history', 'Synced both ways, and skips password managers.', 'memory only'],
    [FileDown, 'Drag and drop', 'APKs install; anything else lands on the phone.', '.apk · any file'],
    [Video, 'Screenshots and recordings', 'One click, saved straight to your Mac.', '~/Pictures · ~/Movies'],
    [AppWindow, 'Compact or full windows', 'Phone frames, always on top, tile them all.', '3 styles × 7 finishes'],
    [Bell, 'Menu bar', 'Every phone and its battery, one click away.', 'launch at login'],
    [MousePointerClick, 'Mouse and keys', 'Right-click is Back, middle-click is Home.', 'volume · rotate · power'],
    [RefreshCw, 'Updates itself', 'Verified downloads; the phone app comes along.', 'SHA-256'],
  ]
  return (
    <section className={`pt-28 ${WRAP}`}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <H2>And the little things.</H2>
        <p className="max-w-sm text-sm">The details that make it feel like part of your Mac, not a remote control.</p>
      </div>
      <BlurFade className="relative mt-12 grid border-t border-l border-border sm:grid-cols-2 lg:grid-cols-4">
        <FrameCorners />
        {items.map(([I, t, b, detail]) => (
          <div key={t} className="group relative flex flex-col border-r border-b border-border p-6 transition-colors hover:bg-primary/[0.06]">
            <span className="flex size-10 items-center justify-center border border-input-border bg-input text-mark transition-colors group-hover:border-primary/60">
              <I className="size-[18px]" strokeWidth={1.6} />
            </span>
            <p className="mt-5 font-medium text-heading">{t}</p>
            <p className="mt-1.5 flex-1 text-sm leading-relaxed">{b}</p>
            <span className="mt-4 self-start">
              <Chip>{detail}</Chip>
            </span>
          </div>
        ))}
      </BlurFade>
    </section>
  )
}

// ---------------------------------------------------------------- privacy

/** Phone ↔ encrypted link ↔ Mac, with a crossed-out cloud: nothing in between. */
function PrivacyDiagram() {
  return (
    <div className="relative border border-border bg-tile p-6 sm:p-8">
      <FrameCorners />
      <Glow className="inset-0 opacity-60" />
      <div className="relative flex items-center justify-between gap-3">
        {(
          [
            [Smartphone, 'Your phone'],
            [Laptop, 'Your Mac'],
          ] as [LucideIcon, string][]
        ).map(([I, t], k) => (
          <div key={t} className={`flex flex-col items-center gap-2 ${k === 1 ? 'order-3' : ''}`}>
            <span className="relative flex size-16 items-center justify-center border border-input-border bg-background text-heading">
              <FrameCorners />
              <I className="size-7" strokeWidth={1.4} />
            </span>
            <span className="text-xs text-heading">{t}</span>
          </div>
        ))}
        <div className="order-2 flex flex-1 flex-col items-center gap-2 px-2">
          <div className="relative h-px w-full bg-gradient-to-r from-transparent via-mark to-transparent">
            <span className="absolute top-1/2 left-1/2 flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center border border-primary/60 bg-background text-mark">
              <Lock className="size-4" strokeWidth={1.8} />
            </span>
          </div>
          <span className="mt-4 font-mono text-[11px] text-muted-foreground">USB · adb · AES-256-GCM</span>
        </div>
      </div>
      <div className="relative mt-8 flex items-center justify-center gap-2.5 border border-dashed border-input-border py-3 text-sm text-muted-foreground">
        <CloudOff className="size-4" strokeWidth={1.6} /> No server, no account, no analytics in between
      </div>
    </div>
  )
}

export function PrivacyBlock() {
  const items: [string, string][] = [
    ['No accounts, no analytics', 'The only internet request is the update check.'],
    ['Encrypted Wi-Fi link', 'Paired with a 6-digit code, AES-256-GCM on every frame.'],
    ['Your PIN behind Touch ID', 'Saved PINs stay encrypted in your keychain.'],
    ['Forget works both ways', 'Forget on either side and the other forgets too.'],
    ['You decide what the Mac reads', 'Details, icons and agent access switch off on the phone.'],
    ['Agents are opt-in', 'Off by default, localhost only, behind a token.'],
  ]
  return (
    <section id="privacy" className={`pt-28 ${WRAP}`}>
      <div className="grid items-start gap-12 lg:grid-cols-[1fr_1.05fr]">
        <div className="min-w-0">
          <H2>Private by default.</H2>
          <p className="mt-4 max-w-md text-lg">Your phone stays between your phone and your Mac. Here’s exactly what that means.</p>
          <BlurFade className="mt-8">
            <PrivacyDiagram />
          </BlurFade>
          <div className="mt-8 flex flex-wrap gap-2">
            <HoverButton href="/privacy">Read the privacy policy</HoverButton>
            <GhostLink href={REPO}>Source on GitHub</GhostLink>
          </div>
        </div>
        <ul className="divide-y divide-border border-y border-border">
          {items.map(([t, b], k) => (
            <BlurFade key={t} delay={k * 0.04}>
              <li className="flex items-start gap-4 py-5">
                <span className="mt-0.5">
                  <Ok />
                </span>
                <div>
                  <p className="font-medium text-heading">{t}</p>
                  <p className="mt-1 text-sm leading-relaxed">{b}</p>
                </div>
              </li>
            </BlurFade>
          ))}
        </ul>
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
              <a key={o.version} href={`/changelog#v${o.version}`} className="font-mono text-[11px] text-muted-foreground hover:text-heading">
                v{o.version} · {o.title}
              </a>
            ))}
          </div>
          <div className="mt-5">
            <MoreLink href="/changelog">Full changelog</MoreLink>
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

type Topic = 'Setup' | 'Privacy' | 'Agents'
const FAQ: [Topic, string, ReactNode][] = [
  ['Setup', 'Is it free?', 'Yes. No trial, no account, no in-app purchases.'],
  ['Setup', 'Which Macs and phones?', 'Macs with Apple Silicon on macOS 13 or newer, and phones on Android 10 or newer. Intel Macs, Windows and Linux aren’t supported yet.'],
  ['Setup', 'Do I need developer options on my phone?', 'No. Wi-Fi, no setup mode only needs the phone app. Developer mode adds second screens, full multi-touch, PIN unlock and all the agent tools.'],
  ['Setup', 'Why does macOS warn me when I open it?', <>Twinglass isn’t notarized yet. Installing from the terminal or Homebrew avoids the warning. If you downloaded the DMG in a browser, run <CopyInline command="xattr -cr /Applications/Twinglass.app" /> once.</>],
  ['Setup', 'How does it update?', 'The Mac app checks GitHub for new releases, verifies the download’s SHA-256, swaps itself in place and reopens. It then offers the matching phone app to your phones.'],
  ['Setup', 'Does it work with iPhone?', 'No. Twinglass is built on Android’s own tools: adb, scrcpy and the accessibility service.'],
  ['Privacy', 'Does the phone app need the internet?', 'No. It only talks to your paired Mac, and it gets its updates from your Mac too.'],
  ['Privacy', 'What does Twinglass send anywhere?', 'Nothing about you. The Mac app’s only internet request is the update check against GitHub Releases.'],
  ['Agents', 'Is my data safe with agents?', 'Agent access is off by default. If you turn it on, the AI tool you connect can see your phone’s screen and may send it to its provider, so only use it with tools you trust.'],
  ['Agents', 'Can an agent use my phone while I’m using it?', 'Yes. Agents work on their own second screen of the phone, in a window you can watch, so your screen stays yours.'],
]

export function Faq() {
  const [topic, setTopic] = useState<Topic | 'All'>('All')
  const [open, setOpen] = useState<string | null>(FAQ[0]![1])
  const shown = FAQ.filter(([t]) => topic === 'All' || t === topic)
  const topics: (Topic | 'All')[] = ['All', 'Setup', 'Privacy', 'Agents']
  return (
    <section id="faq" className={`pt-28 ${WRAP}`}>
      <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="flex flex-col">
          <H2>Questions.</H2>
          <p className="mt-4 max-w-sm">The ones people ask before they install. Pick a topic to narrow them down.</p>
          <div role="tablist" aria-label="Topics" className="mt-6 flex flex-wrap gap-1.5">
            {topics.map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={t === topic}
                onClick={() => setTopic(t)}
                className={`h-8 rounded-full border px-3.5 text-[13px] transition-colors ${t === topic ? 'border-primary/70 bg-primary/15 text-heading' : 'border-input-border bg-input text-muted-foreground hover:text-heading'}`}
              >
                {t}
                <span className="ml-1.5 text-[11px] opacity-60">{t === 'All' ? FAQ.length : FAQ.filter(([x]) => x === t).length}</span>
              </button>
            ))}
          </div>
          <div className="relative mt-10 border border-border bg-tile p-6 lg:mt-auto">
            <FrameCorners />
            <p className="font-medium text-heading">Still stuck?</p>
            <p className="mt-1.5 text-sm">Open an issue and include your Mac and phone models. Settings → About → Copy version details helps.</p>
            <div className="mt-4 flex flex-col gap-2 text-sm">
              <MoreLink href={`${REPO}/issues/new`}>Report a problem on GitHub</MoreLink>
              <MoreLink href={`${DOCS}/AGENTS.md`}>Agent setup guide</MoreLink>
              <MoreLink href="/privacy">Privacy policy</MoreLink>
            </div>
          </div>
        </div>
        <div className="border-t border-border">
          {shown.map(([t, q, a], k) => {
            const isOpen = open === q
            return (
              <div key={q} className="border-b border-border">
                <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : q)} className="flex w-full items-center gap-4 py-5 text-left">
                  <span className="w-6 shrink-0 font-mono text-xs text-muted-foreground">{String(k + 1).padStart(2, '0')}</span>
                  <span className={`flex-1 font-medium transition-colors ${isOpen ? 'text-heading' : 'text-heading/85'}`}>{q}</span>
                  {topic === 'All' && <span className="hidden text-[11px] text-muted-foreground sm:inline">{t}</span>}
                  <span className={`flex size-7 shrink-0 items-center justify-center border transition-colors ${isOpen ? 'border-primary/60 bg-primary/15 text-mark' : 'border-input-border text-muted-foreground'}`}>
                    <Plus className={`size-3.5 transition-transform duration-300 ${isOpen ? 'rotate-45' : ''}`} />
                  </span>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
                      <p className="pr-12 pb-6 pl-10 text-sm leading-relaxed">{a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- closing call to action + download

// The download box rises into place as the section scrolls in, over a soft violet glow
// (motion's useScroll / useTransform). Still for reduced motion.
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
      <div ref={ref} className="relative py-10 lg:py-16">
        <motion.div style={{ opacity: glow }} className="absolute -inset-x-16 inset-y-0 [mask-image:radial-gradient(ellipse_60%_55%_at_50%_60%,black_30%,transparent_75%)]">
          <Glow className="inset-0 [background:radial-gradient(ellipse_70%_60%_at_50%_70%,rgb(124_92_255/0.6),rgb(91_108_255/0.2)_45%,transparent_75%)]" />
        </motion.div>
        <motion.div style={{ scale, y: lift }} className="relative z-10 mx-auto max-w-2xl">
          <DownloadPanel />
        </motion.div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- footer

/** Credits: everything Twinglass is made with (logos from Simple Icons, CC0; marks belong to their owners). */
type Tech = [name: string, href: string, logo: SimpleIcon | LucideIcon]
const MADE_WITH: [string, Tech[]][] = [
  [
    'Mac app',
    [
      ['Electron', 'https://www.electronjs.org', siElectron],
      ['Node.js', 'https://nodejs.org', siNodedotjs],
      ['TypeScript', 'https://www.typescriptlang.org', siTypescript],
      ['React', 'https://react.dev', siReact],
      ['electron-vite', 'https://electron-vite.org', siVite],
      ['Tailwind CSS', 'https://tailwindcss.com', siTailwindcss],
      ['shadcn/ui', 'https://ui.shadcn.com', siShadcnui],
      ['Radix UI', 'https://www.radix-ui.com', siRadixui],
      ['Magic UI', 'https://magicui.design', Sparkles],
      ['Lucide', 'https://lucide.dev', siLucide],
      ['WebCodecs', 'https://developer.mozilla.org/docs/Web/API/WebCodecs_API', Video],
      ['electron-builder', 'https://www.electron.build', siElectronbuilder],
    ],
  ],
  [
    'Phone app',
    [
      ['Kotlin', 'https://kotlinlang.org', siKotlin],
      ['Jetpack Compose', 'https://developer.android.com/compose', siJetpackcompose],
      ['Material 3', 'https://m3.material.io', siMaterialdesign],
      ['Gradle', 'https://gradle.org', siGradle],
      ['ML Kit code scanner', 'https://developers.google.com/ml-kit/vision/barcode-scanning/code-scanner', siGoogle],
    ],
  ],
  [
    'Phone link & agents',
    [
      ['scrcpy', 'https://github.com/Genymobile/scrcpy', Terminal],
      ['adb', 'https://developer.android.com/tools/adb', siAndroid],
      ['Model Context Protocol', 'https://modelcontextprotocol.io', siModelcontextprotocol],
      ['Zod', 'https://zod.dev', siZod],
      ['Vitest', 'https://vitest.dev', siVitest],
      ['Claude Code', 'https://claude.com/claude-code', siClaude],
    ],
  ],
  [
    'Shipping & this site',
    [
      ['GitHub', REPO, siGithub],
      ['Homebrew', 'https://brew.sh', siHomebrew],
      ['Bash', 'https://www.gnu.org/software/bash/', siGnubash],
      ['Vite', 'https://vite.dev', siVite],
      ['Motion', 'https://motion.dev', Sparkles],
      ['Simple Icons', 'https://simpleicons.org', siSimpleicons],
      ['Vercel', 'https://vercel.com', siVercel],
    ],
  ],
]

/** Credits, just above the footer: one short paragraph with every project as a linked chip. */
export function MadeWith() {
  const all = new Map(MADE_WITH.flatMap(([, items]) => items).map((t) => [t[0], t]))
  const c = (name: string) => {
    const [, href, logo] = all.get(name)!
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="transition-opacity hover:opacity-75">
        {'path' in logo ? <Tag logo={logo}>{name}</Tag> : <Tag icon={logo}>{name}</Tag>}
      </a>
    )
  }
  return (
    <section aria-labelledby="made-with" className={`mt-32 text-center ${WRAP}`}>
      <p id="made-with" className="font-mono text-[11px] text-muted-foreground uppercase">
        Made with
      </p>
      <p className="mx-auto mt-4 max-w-4xl text-base leading-[2.1] text-balance sm:text-lg">
        The Mac app is {c('Electron')} and {c('Node.js')}, written in {c('TypeScript')} with {c('React')}, built by {c('electron-vite')} and styled with{' '}
        {c('Tailwind CSS')}, {c('shadcn/ui')}, {c('Radix UI')}, {c('Magic UI')} and {c('Lucide')} icons. Video decodes in hardware through {c('WebCodecs')}, and{' '}
        {c('electron-builder')} packs it up. The phone app is {c('Kotlin')} and {c('Jetpack Compose')} with {c('Material 3')}, built with {c('Gradle')}, and pairs
        using Google’s {c('ML Kit code scanner')}. Underneath, {c('scrcpy')} and {c('adb')} carry the screen and the input, agents talk through the{' '}
        {c('Model Context Protocol')} with {c('Zod')} checking every call, and {c('Vitest')} keeps the protocol honest. A lot of it was written alongside{' '}
        {c('Claude Code')}. It ships from {c('GitHub')} and {c('Homebrew')} with a little {c('Bash')}, and this site is {c('Vite')}, {c('Motion')} and{' '}
        {c('Simple Icons')} on {c('Vercel')}. Thank you to everyone behind them.
      </p>
    </section>
  )
}

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
    <footer className={`mt-16 pb-10 ${WRAP}`}>
      <div className="relative border border-border px-6 py-10 sm:px-10">
        <FrameCorners />
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
          <div className="col-span-2 flex max-w-sm flex-col gap-3 lg:col-span-1">
            <span className="flex items-center gap-2 font-semibold text-heading">
              <img src="/icon.png" alt="" className="size-5 rounded-[5px]" /> Twinglass
            </span>
            <p className="text-sm">An indie Mac app for people who work next to an Android phone. No accounts, no analytics.</p>
          </div>
          {col('Product', [local('/#features', 'Features'), local('/#how', 'How it works'), local('/#agents', 'For agents'), local('/tools', 'Agent tools'), local('/#download', 'Download')])}
          {col('Project', [out(REPO, 'GitHub'), local('/releases', 'Releases'), local('/changelog', 'Changelog')])}
          {col('Help & legal', [local('/privacy', 'Privacy Policy'), out(`${REPO}/issues/new`, 'Report a problem'), out(`${DOCS}/AGENTS.md`, 'Agent setup')])}
        </div>
        <p className="mt-12 text-xs text-muted-foreground">
          © 2026 Nikhil Kumawat · Built on{' '}
          <a href="https://github.com/Genymobile/scrcpy" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-heading">
            scrcpy
          </a>
          . Not affiliated with Google or Genymobile. Android is a trademark of Google LLC.
        </p>
        {/* The name set large and cut off by the card's bottom edge, as a sign-off. */}
        <div aria-hidden className="-mx-6 -mb-10 mt-10 overflow-hidden sm:-mx-10">
          <p className="font-soft -mb-[0.22em] bg-gradient-to-b from-input-border to-tile bg-clip-text text-center text-[clamp(3rem,15vw,13.5rem)] leading-none whitespace-nowrap text-transparent select-none">
            Twinglass
          </p>
        </div>
      </div>
    </footer>
  )
}
