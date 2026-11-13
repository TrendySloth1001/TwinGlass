// /tools: every tool the Twinglass MCP server gives a coding agent, explained in plain words.
// Source of truth: src/main/agent/mcp-server.ts (keep the list and the count in step with it).
import {
  AppWindow,
  ArrowUpRight,
  Bell,
  Bug,
  Camera,
  Clipboard,
  Cpu,
  Eraser,
  Eye,
  FileDown,
  FileUp,
  Fingerprint,
  FlaskConical,
  PlayCircle,
  Ruler,
  FolderOpen,
  Gauge,
  Hand,
  Info,
  Keyboard,
  Layers,
  LayoutGrid,
  Link,
  ListTree,
  MousePointerClick,
  Move,
  Network,
  Package,
  PackageX,
  Play,
  Pointer,
  Rocket,
  ScanSearch,
  ScrollText,
  Search,
  ShieldCheck,
  Smartphone,
  SlidersHorizontal,
  SquareTerminal,
  Timer,
  Type,
  Video,
  Hourglass,
  ListOrdered,
  ChevronsDown,
  OctagonX,
  type LucideIcon,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { FrameCorners, REPO } from '../components/base'

type Tool = { name: string; icon: LucideIcon; what: string; example?: string }
type Group = { id: string; short: string; title: string; blurb: string; tools: Tool[] }

const GROUPS: Group[] = [
  {
    id: 'phone',
    short: 'Phone',
    title: 'The phone and its screens',
    blurb: 'Which phone, what state it’s in, and the agent’s own screen to work on.',
    tools: [
      { name: 'list_devices', icon: Smartphone, what: 'Lists the phones Twinglass can reach, over USB or Wi-Fi, with model and Android version.' },
      { name: 'device_info', icon: Info, what: 'A quick status check: battery, locked or not, the app in front, open apps, and the screen size taps are measured in.' },
      { name: 'phone_details', icon: Cpu, what: 'The full spec sheet: chip, CPU, memory, storage, display, battery, cameras, sensors, codecs and network.' },
      {
        name: 'agent_screen',
        icon: Layers,
        what: 'Opens, checks or closes the agent’s own second screen of the phone, so it can work without taking over yours.',
        example: 'It opens by itself on the first action.',
      },
      {
        name: 'unlock_phone',
        icon: Fingerprint,
        what: 'Unlocks the lock screen with the PIN you saved in Twinglass, only after you approve with Touch ID. The agent never sees the PIN.',
      },
    ],
  },
  {
    id: 'see',
    short: 'Seeing',
    title: 'Seeing the screen',
    blurb: 'Look before acting: pictures, the list of what’s on screen, and exact layout.',
    tools: [
      { name: 'screenshot', icon: Camera, what: 'A picture of the screen. Tap and swipe positions use this picture’s pixels.' },
      { name: 'get_ui_tree', icon: ListTree, what: 'Every element on screen (labels, ids, buttons, fields, checkboxes) with where it is, so the agent can read the screen like text.' },
      { name: 'find_elements', icon: Search, what: 'Finds elements by text or id without reading the whole screen. Faster and cheaper than the full tree.' },
      {
        name: 'screen_map',
        icon: LayoutGrid,
        what: 'Exact layout in dp: positions, sizes, gaps, insets, text sizes and colours, plus an annotated image. For building UI that matches a design.',
      },
      { name: 'wait_for', icon: Hourglass, what: 'Waits until something appears (or disappears) on screen, instead of guessing how long loading takes.' },
      { name: 'wait', icon: Timer, what: 'Waits a fixed time, up to 10 seconds. The fallback when there’s nothing specific to wait for.' },
    ],
  },
  {
    id: 'act',
    short: 'Touch & type',
    title: 'Touching and typing',
    blurb: 'Everything a finger and a keyboard can do, by element or by position.',
    tools: [
      {
        name: 'tap_element',
        icon: MousePointerClick,
        what: 'Presses a button or row by its text or id, no coordinates needed. Waits for it to appear and for the screen to settle.',
        example: 'tap_element “Sign in”',
      },
      { name: 'set_text', icon: Type, what: 'Replaces a field’s text in any language, emoji included, then reads it back to confirm it took.' },
      { name: 'tap', icon: Pointer, what: 'Taps a point on the screen.' },
      { name: 'long_press', icon: Hand, what: 'Presses and holds, for context menus, drag handles and selecting text.' },
      { name: 'swipe', icon: Move, what: 'Drags one finger from one point to another.' },
      { name: 'scroll', icon: ChevronsDown, what: 'Scrolls up, down or sideways, and says whether anything actually moved.' },
      { name: 'type_text', icon: Keyboard, what: 'Types into the field that has focus, optionally pressing Enter after.' },
      { name: 'press_key', icon: Keyboard, what: 'Presses Back, Home, Recents, Enter, Delete, volume, power and other keys.' },
      { name: 'set_clipboard', icon: Clipboard, what: 'Puts text on the phone’s clipboard, ready to paste.' },
      {
        name: 'run_steps',
        icon: ListOrdered,
        what: 'Runs a list of actions in one go and stops at the first one that fails. Good for flows the agent already knows.',
      },
    ],
  },
  {
    id: 'apps',
    short: 'Apps',
    title: 'Apps',
    blurb: 'Find, open, install and reset apps, and control what they’re allowed to do.',
    tools: [
      { name: 'list_apps', icon: AppWindow, what: 'Installed apps with their names and package names, optionally filtered.' },
      { name: 'launch_app', icon: Play, what: 'Opens an app by its name or package. On the agent screen, it opens there.' },
      { name: 'open_url', icon: Link, what: 'Opens a link in the right app: web pages, email, phone numbers, maps, the Play Store and app deep links.' },
      { name: 'stop_app', icon: OctagonX, what: 'Force-stops an app so it can start again cleanly.' },
      { name: 'app_info', icon: Package, what: 'An app’s version, SDK levels, install and update dates, permissions granted or denied, and whether it’s running.' },
      {
        name: 'start_activity',
        icon: Rocket,
        what: 'Starts an app or a specific screen with an intent (deep links, extras), and reports how long the launch took. Can force a cold start.',
      },
      { name: 'install_apk', icon: FileDown, what: 'Installs or updates an app from an .apk on the Mac, such as a build you just made.' },
      { name: 'uninstall_app', icon: PackageX, what: 'Uninstalls an app, optionally keeping its data for a reinstall.' },
      { name: 'clear_app_data', icon: Eraser, what: 'Wipes an app’s data and cache, as if freshly installed: logged out, onboarding again.' },
      { name: 'set_permission', icon: ShieldCheck, what: 'Grants or revokes an app’s permissions (camera, location, notifications, microphone…), or resets them so it asks again.' },
    ],
  },
  {
    id: 'test',
    short: 'Testing',
    title: 'Testing and debugging',
    blurb: 'Logs, crashes, performance, and the conditions an app has to survive.',
    tools: [
      { name: 'logcat', icon: ScrollText, what: 'Recent Android log lines, filtered by app, level or text.' },
      { name: 'get_crashes', icon: Bug, what: 'Recent crashes with their stack traces, Java or native, for one app or all.' },
      { name: 'app_performance', icon: Gauge, what: 'How smooth and heavy an app is: janky frames, frame times, memory and CPU.' },
      {
        name: 'set_device_state',
        icon: SlidersHorizontal,
        what: 'Tests under other conditions: dark mode, bigger fonts, animations off, density, Wi-Fi, mobile data, airplane mode, battery level. Always reset after.',
      },
      { name: 'reverse_port', icon: Network, what: 'Lets the app on the phone reach a server on your Mac (dev server, mock API, Metro) through its own localhost.' },
      { name: 'record_screen', icon: Video, what: 'Records a video of the screen for a bug report or demo, saved to your Mac.' },
      { name: 'get_notifications', icon: Bell, what: 'The phone’s current notifications: app, title, text and time, newest first.' },
      {
        name: 'shell',
        icon: SquareTerminal,
        what: 'Runs an adb shell command on the phone. Off unless you allow it in Twinglass → Settings → Agents.',
      },
    ],
  },
  {
    id: 'qa',
    short: 'Tests & design',
    title: 'Recorded tests and design',
    blurb: 'Replay what you recorded in Twinglass, and check the screen against the Figma design.',
    tools: [
      { name: 'list_tests', icon: FlaskConical, what: 'The tests you recorded in Twinglass, with their steps in plain words.' },
      {
        name: 'run_test',
        icon: PlayCircle,
        what: 'Replays a recorded test. Each step finds its element by what it says, not where it was, and waits for the screen to settle. Stops at the first failure and says why.',
        example: 'run_test “Sign in”',
      },
      {
        name: 'compare_design',
        icon: Ruler,
        what: 'Compares a Figma frame with the screen: texts missing or extra, and positions, widths, font sizes and colours that are off, in dp and sp.',
      },
    ],
  },
  {
    id: 'files',
    short: 'Files',
    title: 'Files',
    blurb: 'Move files between your Mac and the phone.',
    tools: [
      { name: 'push_file', icon: FileUp, what: 'Copies a file from the Mac to the phone, into Downloads by default, so it shows in Files and Gallery.' },
      { name: 'pull_file', icon: FileDown, what: 'Copies a file from the phone to ~/Downloads/Twinglass on the Mac.' },
      { name: 'list_files', icon: FolderOpen, what: 'Lists a folder on the phone, like Downloads or the camera roll.' },
    ],
  },
]

/** Name → tool, for the tool chips elsewhere on the site (icon and tooltip). */
export const TOOL_INFO = new Map(GROUPS.flatMap((g) => g.tools.map((t) => [t.name, t] as const)))

export const TOOL_COUNT = GROUPS.reduce((n, g) => n + g.tools.length, 0)

export function Tools() {
  const [q, setQ] = useState('')
  const [only, setOnly] = useState<string | null>(null)
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    return GROUPS.filter((g) => !only || g.id === only)
      .map((g) => ({ ...g, tools: g.tools.filter((x) => !t || x.name.includes(t.replace(/\s+/g, '_')) || x.what.toLowerCase().includes(t)) }))
      .filter((g) => g.tools.length)
  }, [q, only])
  const pill = (on: boolean) =>
    `h-8 border px-3 text-sm transition-colors ${on ? 'border-mark/60 bg-mark/10 text-heading' : 'border-input-border bg-input text-muted-foreground hover:text-heading'}`

  return (
    <main className="mx-auto max-w-6xl px-4 pt-32 pb-10 sm:px-6 lg:px-10">
      <p className="font-mono text-[11px] text-muted-foreground uppercase">For coding agents</p>
      <h1 className="font-soft mt-3 text-5xl sm:text-6xl">All {TOOL_COUNT} tools</h1>
      <p className="mt-4 max-w-2xl text-lg">
        Turn on agent access in Twinglass and any MCP client (Claude Code, Cursor, VS Code and others) gets these tools for your phone. Agents work on their own
        second screen, check every step, and need your Touch ID to unlock.
      </p>
      <div className="mt-6 flex flex-wrap gap-2 text-sm">
        <a
          href={`${REPO}/blob/master/docs/AGENTS.md`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 border border-input-border bg-input px-3 py-1.5 text-heading hover:bg-muted"
        >
          <Eye className="size-4 text-mark" /> Set up an agent <ArrowUpRight className="size-3.5" />
        </a>
      </div>

      <div className="sticky top-0 z-10 mt-12 -mx-2 flex flex-col gap-3 bg-background/85 px-2 py-3 backdrop-blur-xl sm:flex-row sm:items-center">
        <label className="relative flex-1 sm:max-w-xs">
          <ScanSearch className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search tools"
            aria-label="Search tools"
            className="h-9 w-full border border-input-border bg-input pr-3 pl-9 text-sm text-heading outline-none placeholder:text-muted-foreground focus:border-mark/60"
          />
        </label>
        <div className="flex gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button type="button" onClick={() => setOnly(null)} className={pill(!only)}>
            All
          </button>
          {GROUPS.map((g) => (
            <button key={g.id} type="button" onClick={() => setOnly(only === g.id ? null : g.id)} className={`${pill(only === g.id)} shrink-0 whitespace-nowrap`}>
              {g.short} <span className="ml-1 font-mono text-xs opacity-60">{g.tools.length}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-14">
        {shown.map((g) => (
          <section key={g.id} id={g.id} className="scroll-mt-40">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="font-soft text-3xl">{g.title}</h2>
              <span className="font-mono text-xs text-muted-foreground">{GROUPS.find((x) => x.id === g.id)!.tools.length} tools</span>
            </div>
            <p className="mt-2 max-w-2xl">{g.blurb}</p>
            <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {g.tools.map((t) => (
                <li key={t.name} className="relative flex flex-col gap-3 border border-border bg-tile p-5">
                  <FrameCorners />
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-8 shrink-0 items-center justify-center border border-input-border bg-input">
                      <t.icon className="size-4 text-mark" />
                    </span>
                    <code className="font-mono text-sm text-heading">{t.name}</code>
                  </div>
                  <p className="text-sm leading-relaxed">{t.what}</p>
                  {t.example && <p className="mt-auto font-mono text-xs text-muted-foreground">{t.example}</p>}
                </li>
              ))}
            </ul>
          </section>
        ))}
        {!shown.length && <p className="text-muted-foreground">No tool matches “{q}”.</p>}
      </div>
    </main>
  )
}
