// Device control for coding agents (used by the MCP server). Agents work in "agent space": the
// coordinate system of the screenshots they receive (longest side AGENT_MAX_DIM px).
//
// Where agents act ("screen"):
//  - agent (default): their OWN second screen, a virtual display Twinglass opens for them in a
//    window the user can watch. The user keeps using the phone; nothing the agent does shows up
//    on the physical screen.
//  - phone: the phone's own screen (what the user sees on the phone).
//
// Injection paths:
//  - a live session for that screen -> scrcpy control socket (fast, same as the user's mouse)
//  - phone screen without a mirror -> `adb shell input …` (slower)
// Reading the UI: the phone app's accessibility service (any display; phone-bridge.ts), else
// `uiautomator dump` (phone screen only).
import { execFile } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { mkdirSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, isAbsolute, join } from 'node:path'
import { promisify } from 'node:util'
import { nativeImage } from 'electron'
import { AndroidKey } from '@shared/input/keycodes'
import { KeyAction, MotionAction, PointerId } from '@shared/scrcpy/constants'
import { injectKeycode, injectText, injectTouch, scanFile, setClipboard, startApp, type Size } from '@shared/scrcpy/control'
import type { Adb, Device } from '../adb/adb'
import { phoneDetails } from '../companion-link'
import { listApps, parseDisplayTasks, shellQuote, type PhoneApp } from '../phone-apps'
import type { LiveSession } from '../session-ipc'
import type { ScrcpySession } from '../scrcpy/session'
import { agentSpace, checkPoint, mapPoint, type Point } from './geometry'
import { parseCpuinfo, parseGfxinfo, parseLaunchTime, parseMeminfoPss, parsePackageDump, validUri, type PackageFacts } from './app-testing'
import { bridgeCall, BridgeError, parseNotifications, type PhoneNotification } from './phone-bridge'
import { buildScreenMap, sampleColors, type ScreenMap } from './screen-map'
import { parseKeyguardShowing } from '../adb/lock'
import { clickableAround, escapeInputText, fieldText, matchNodes, parseA11yTree, parseUiDump, sameFieldText, screenSignature, type NodeQuery, type UiNode } from './ui-tree'

const execFileP = promisify(execFile)
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Keys agents may press. Values are android.view.KeyEvent codes. */
export const AGENT_KEYS = {
  back: AndroidKey.BACK,
  home: AndroidKey.HOME,
  recents: AndroidKey.APP_SWITCH,
  enter: 66,
  delete: 67,
  forward_delete: 112,
  tab: 61,
  escape: 111,
  space: 62,
  dpad_up: 19,
  dpad_down: 20,
  dpad_left: 21,
  dpad_right: 22,
  move_home: 122,
  move_end: 123,
  page_up: 92,
  page_down: 93,
  volume_up: AndroidKey.VOLUME_UP,
  volume_down: AndroidKey.VOLUME_DOWN,
  power: AndroidKey.POWER,
  wakeup: AndroidKey.WAKEUP,
  menu: AndroidKey.MENU,
  search: 84,
  media_play_pause: 85,
  camera: 27,
} as const
export type AgentKey = keyof typeof AGENT_KEYS

export type ScreenChoice = 'agent' | 'phone'

export interface Screenshot {
  /** base64 JPEG */
  data: string
  mimeType: 'image/jpeg'
  width: number
  height: number
  source: 'mirror' | 'screencap'
  screen: ScreenChoice
}

export interface AgentOptions {
  /** Where agents act unless a tool call says otherwise. */
  workspace: ScreenChoice
  /** The `shell` tool (arbitrary adb shell commands). Off unless the user turns it on. */
  allowShell: boolean
  /** clear_app_data, uninstall_app, set_permission. */
  allowAppChanges: boolean
  /** set_device_state. */
  allowDeviceSettings: boolean
  /** File transfer and install_apk. */
  allowFiles: boolean
  /** Close the agent screen after this many idle minutes (0 = never). */
  idleCloseMin: number
  screenSize: 'phone' | 'tablet' | 'match'
  screenshotMaxDim: number
  jpegQuality: number
}

export interface DisplaySpec {
  width: number
  height: number
  dpi: number
}

/** Agent screen size per setting; "match" uses the phone's own resolution and density. */
export function agentDisplaySpec(size: AgentOptions['screenSize'], phone: { width: number; height: number; dpi: number } | null): DisplaySpec {
  if (size === 'tablet') return { width: 1600, height: 2560, dpi: 320 }
  if (size === 'match' && phone) {
    const portrait = { width: Math.min(phone.width, phone.height), height: Math.max(phone.width, phone.height) }
    return { ...portrait, dpi: Math.min(Math.max(phone.dpi, 120), 640) }
  }
  return { width: 1080, height: 2400, dpi: 420 }
}

/** Which setting allows a group of tools (shown in the refusal so the agent can tell the user). */
const GATES = {
  allowShell: '"Allow shell commands"',
  allowAppChanges: '"Allow clearing, uninstalling and permission changes"',
  allowDeviceSettings: '"Allow changing phone settings"',
  allowFiles: '"Allow files and installs"',
} as const

export interface ControllerDeps {
  adb: () => Adb | null
  serverPath: () => string
  options: () => AgentOptions
  /** Live session for a phone (any of its transport serials): its screen, or the agent screen. */
  findSession: (transportSerials: string[], which: ScreenChoice) => LiveSession | null
  /** Opens the agent screen window for a phone (returns at once; the session follows). */
  openAgentScreen: (serial: string, kind: 'usb' | 'wifi', display: DisplaySpec) => void
  /** Closes a window (the agent screen). */
  closeWindow: (webContentsId: number) => void
  /** Starts / stops the recorder of a session's window; stop resolves with the saved file. */
  record: (webContentsId: number, on: boolean) => Promise<string | null>
  /** Unlock with the user's saved PIN after Touch ID approval on the Mac. */
  unlock: (adb: Adb, session: ScrcpySession) => Promise<{ ok: boolean; message: string }>
}

interface Target {
  adb: Adb
  device: Device
  serial: string
  screen: ScreenChoice
  session: ScrcpySession | null
  live: LiveSession | null
  /** Android display id: 0 for the phone's screen, the virtual display's for the agent screen. */
  displayId: number
}

/** Where pulled files go: ~/Downloads/Twinglass. */
const pullFolder = (): string => join(homedir(), 'Downloads', 'Twinglass')

export class DeviceController extends EventEmitter<{ activity: [string] }> {
  /** Phone screen size in device pixels (from screencap/wm size), per device id. */
  private screens = new Map<string, Size>()
  /** Device settings changed by set_device_state, with their values before: restored by reset. */
  private changed = new Map<string, Map<string, string>>()
  /** Agent screens being opened, per device id (one window even with parallel tool calls). */
  private opening = new Map<string, Promise<LiveSession>>()

  /** Last agent action per device id (idle close of the agent screen). */
  private lastActive = new Map<string, number>()

  constructor(private readonly deps: ControllerDeps) {
    super()
    // Close idle agent screens (their apps move to the phone) when the user set a time limit.
    setInterval(() => {
      const min = this.deps.options().idleCloseMin
      if (!min) return
      for (const [id, at] of this.lastActive) {
        if (Date.now() - at < min * 60_000) continue
        this.lastActive.delete(id)
        void this.pickDevice(id)
          .then(({ device }) => {
            const l = this.deps.findSession(device.transports.map((t) => t.serial), 'agent')
            if (l) {
              this.deps.closeWindow(l.webContentsId)
              this.emit('activity', `closed the agent screen after ${min} idle minutes`)
            }
          })
          .catch(() => {})
      }
    }, 30_000).unref?.()
  }

  private log(msg: string): void {
    this.emit('activity', msg)
  }

  private allow(gate: keyof typeof GATES): void {
    if (!this.deps.options()[gate]) throw new Error(`This is turned off in Twinglass → Settings → Agents (${GATES[gate]}). Ask the user to turn it on.`)
  }

  private needAdb(): Adb {
    const adb = this.deps.adb()
    if (!adb) throw new Error('adb not found on this Mac (brew install android-platform-tools)')
    return adb
  }

  async listDevices(): Promise<Device[]> {
    return (await this.needAdb().devices()).devices
  }

  private async pickDevice(device?: string): Promise<{ adb: Adb; device: Device }> {
    const adb = this.needAdb()
    const devices = (await adb.devices()).devices
    if (!devices.length) throw new Error('No phone connected. Connect one by USB or Wi-Fi in Twinglass.')
    if (device) {
      const q = device.toLowerCase()
      const d = devices.find((x) => x.id.toLowerCase() === q || x.model.toLowerCase() === q || x.transports.some((t) => t.serial.toLowerCase() === q))
      if (!d) throw new Error(`No phone matches "${device}". Call list_devices.`)
      return { adb, device: d }
    }
    const serials = (x: Device): string[] => x.transports.map((s) => s.serial)
    const busy = devices.find((x) => this.deps.findSession(serials(x), 'agent') ?? this.deps.findSession(serials(x), 'phone'))
    const d = busy ?? (devices.length === 1 ? devices[0] : undefined)
    if (!d) throw new Error('Several phones are connected: pass `device` (see list_devices).')
    return { adb, device: d }
  }

  /** Opens the agent screen if needed and waits until it streams (video size and display id known). */
  private async agentSession(device: Device): Promise<LiveSession> {
    const serials = device.transports.map((t) => t.serial)
    const ready = (l: LiveSession | null): l is LiveSession => !!l && !!l.session.videoSize && l.session.displayId !== null
    const now = this.deps.findSession(serials, 'agent')
    if (ready(now)) return now
    const pending = this.opening.get(device.id)
    if (pending) return pending
    const p = (async () => {
      if (!now) {
        const t = device.transports[0]!
        this.log('opening its own second screen (the agent screen)')
        const size = this.deps.options().screenSize
        let phone: { width: number; height: number; dpi: number } | null = null
        if (size === 'match') {
          const [wm = '', dens = ''] = await this.needAdb().shellBatch(t.serial, ['wm size', 'wm density'])
          const m = /(?:Override|Physical) size: (\d+)x(\d+)/.exec(wm)
          const d = /(?:Override|Physical) density: (\d+)/.exec(dens)
          if (m && d) phone = { width: Number(m[1]), height: Number(m[2]), dpi: Number(d[1]) }
        }
        this.deps.openAgentScreen(t.serial, t.kind, agentDisplaySpec(size, phone))
      }
      for (let i = 0; i < 100; i++) {
        await sleep(150)
        const l = this.deps.findSession(serials, 'agent')
        if (ready(l)) {
          await sleep(400) // first frames
          return l
        }
      }
      throw new Error('The agent screen did not start in 15 s. Check the phone connection in Twinglass, or use screen "phone".')
    })().finally(() => this.opening.delete(device.id))
    this.opening.set(device.id, p)
    return p
  }

  private async target(device?: string, screen?: ScreenChoice): Promise<Target> {
    const { adb, device: d } = await this.pickDevice(device)
    const which = screen ?? this.deps.options().workspace
    this.lastActive.set(d.id, Date.now())
    if (which === 'agent') {
      const live = await this.agentSession(d)
      return { adb, device: d, serial: live.session.serial, screen: 'agent', session: live.session, live, displayId: live.session.displayId ?? 0 }
    }
    const live = this.deps.findSession(d.transports.map((s) => s.serial), 'phone')
    return { adb, device: d, serial: live?.session.serial ?? d.transports[0]!.serial, screen: 'phone', session: live?.session ?? null, live, displayId: 0 }
  }

  /** Screen size in device (display) pixels, current orientation. */
  private async screenSize(t: Target): Promise<Size> {
    const video = t.session?.videoSize
    const orient = (s: Size): Size => (video && video.width > video.height !== s.width > s.height ? { width: s.height, height: s.width } : s)
    const vd = t.session?.displaySize
    if (vd) return orient(vd)
    const known = this.screens.get(t.device.id)
    if (known) return orient(known)
    const out = await t.adb.runLoose(['shell', 'wm', 'size'], t.serial)
    const m = /(?:Override|Physical) size: (\d+)x(\d+)/.exec(out)
    if (!m) throw new Error('could not read the screen size')
    const s = { width: Number(m[1]), height: Number(m[2]) }
    this.screens.set(t.device.id, s)
    return orient(s)
  }

  private async space(t: Target): Promise<Size> {
    return agentSpace(await this.screenSize(t))
  }

  private where(t: Target): string {
    return t.screen === 'agent' ? ' on the agent screen' : ''
  }

  // ---- the agent screen ----

  async agentScreen(action: 'open' | 'close' | 'status', device?: string): Promise<string> {
    const { device: d } = await this.pickDevice(device)
    const serials = d.transports.map((s) => s.serial)
    if (action === 'open') {
      const l = await this.agentSession(d)
      return `The agent screen is open (display ${l.session.displayId}, ${l.session.displaySize?.width}×${l.session.displaySize?.height}).`
    }
    const l = this.deps.findSession(serials, 'agent')
    if (action === 'status') {
      return l
        ? `Open: display ${l.session.displayId}. Apps there: ${(await this.appsOn(this.needAdb(), l.session.serial, l.session.displayId ?? -1)).join(', ') || 'none'}.`
        : `Closed. It opens by itself on the next action (default screen: ${this.deps.options().workspace}).`
    }
    if (!l) return 'The agent screen is not open.'
    this.deps.closeWindow(l.webContentsId)
    this.log('closed the agent screen (its apps move to the phone)')
    return 'Closed the agent screen. Apps that were open there moved to the phone (in the background).'
  }

  private async appsOn(adb: Adb, serial: string, displayId: number): Promise<string[]> {
    return parseDisplayTasks(await adb.runLoose(['shell', 'dumpsys activity activities'], serial, 10_000), displayId)
  }

  // ---- observation ----

  async screenshot(device?: string, screen?: ScreenChoice): Promise<Screenshot> {
    const t = await this.target(device, screen)
    if (t.live) {
      // Fast path: the window scales the live frame and encodes the JPEG itself.
      const space = agentSpace(await this.screenSize(t))
      const jpeg = await t.live.capture({ ...space, quality: this.deps.options().jpegQuality / 100 }).catch(() => null)
      if (jpeg?.length) {
        this.log(`took a screenshot${this.where(t)}`)
        return { data: Buffer.from(jpeg).toString('base64'), mimeType: 'image/jpeg', ...space, source: 'mirror', screen: t.screen }
      }
    }
    let png: Uint8Array | null = null
    let source: Screenshot['source'] = 'mirror'
    if (t.live) png = await t.live.capture().catch(() => null)
    if (!png) {
      if (t.screen === 'agent') throw new Error('The agent screen has no frame yet; wait 500 ms and retry.')
      source = 'screencap'
      const { stdout } = await execFileP(t.adb.path, ['-s', t.serial, 'exec-out', 'screencap', '-p'], {
        encoding: 'buffer',
        maxBuffer: 64 * 1024 * 1024,
        timeout: 15000,
      })
      png = stdout
    }
    let img = nativeImage.createFromBuffer(Buffer.from(png))
    if (img.isEmpty()) throw new Error('screenshot failed (empty image)')
    if (source === 'screencap') this.screens.set(t.device.id, img.getSize())
    const space = agentSpace(source === 'screencap' ? img.getSize() : await this.screenSize(t))
    img = img.resize({ width: space.width, height: space.height, quality: 'good' })
    this.log(`took a screenshot${this.where(t)}`)
    return { data: img.toJPEG(this.deps.options().jpegQuality).toString('base64'), mimeType: 'image/jpeg', ...space, source, screen: t.screen }
  }

  /** UI elements, through the phone app's accessibility service when on, else uiautomator (phone screen). */
  private async readTree(t: Target, system = false): Promise<{ nodes: UiNode[]; space: Size; via: 'phone-app' | 'uiautomator'; keyboard?: boolean }> {
    const screen = await this.screenSize(t)
    const space = agentSpace(screen)
    try {
      // Without `system`, the phone app leaves out the keyboard and the status / navigation bars.
      const res = await bridgeCall(t.adb, t.serial, 'tree', { display: t.displayId, limit: 600, system })
      const wins = Array.isArray(res.windows) ? (res.windows as { keyboard?: boolean }[]) : []
      return { nodes: parseA11yTree(res, screen, space), space, via: 'phone-app', keyboard: wins.some((w) => w.keyboard === true) }
    } catch (e) {
      if (!(e instanceof BridgeError) || t.screen === 'agent') throw e
    }
    const path = '/data/local/tmp/mob-mirror-ui.xml'
    const out = await t.adb.runLoose(['shell', 'uiautomator', 'dump', path], t.serial, 15000)
    if (!/dumped to/i.test(out)) {
      throw new Error(`uiautomator could not dump the screen (${out.trim() || 'timeout'}). This happens while the screen is animating; retry, or use screenshot.`)
    }
    const xml = await t.adb.runLoose(['shell', 'cat', path], t.serial)
    void t.adb.runLoose(['shell', 'rm', '-f', path], t.serial)
    return { nodes: parseUiDump(xml, screen, space), space, via: 'uiautomator' }
  }

  async uiTree(device?: string, screen?: ScreenChoice, system = false): Promise<{ nodes: UiNode[]; space: Size; via: string; screen: ScreenChoice; keyboard?: boolean }> {
    const t = await this.target(device, screen)
    const r = await this.readTree(t, system)
    this.log(`read the screen’s elements${this.where(t)}`)
    return { ...r, screen: t.screen }
  }

  async findElements(q: NodeQuery, device?: string, screen?: ScreenChoice): Promise<UiNode[]> {
    const t = await this.target(device, screen)
    return matchNodes((await this.readTree(t)).nodes, q)
  }

  /** Waits until an element matching `q` appears (or, with gone, disappears). */
  async waitFor(q: NodeQuery, gone: boolean, timeoutMs: number, device?: string, screen?: ScreenChoice): Promise<string> {
    const t = await this.target(device, screen)
    const until = Date.now() + Math.min(Math.max(timeoutMs, 200), 30_000)
    let last: UiNode[] = []
    do {
      last = await this.readTree(t)
        .then((r) => matchNodes(r.nodes, q))
        .catch(() => last)
      if (gone ? !last.length : last.length) {
        this.log(`waited for ${describeQuery(q)}${gone ? ' to go away' : ''}`)
        return gone ? `${describeQuery(q)} is gone.` : `Found ${describeQuery(q)}: ${JSON.stringify(last.slice(0, 5))}`
      }
      await sleep(400)
    } while (Date.now() < until)
    throw new Error(gone ? `${describeQuery(q)} is still there after ${timeoutMs} ms.` : `${describeQuery(q)} did not appear within ${timeoutMs} ms.`)
  }

  /** Presses an element: through the accessibility service (exact, needs no coordinates), else a tap on its centre. */
  /** Elements matching `q`, re-reading for up to `timeoutMs` (menus and pages still opening). */
  private async findNodes(t: Target, q: NodeQuery, timeoutMs: number): Promise<{ hit: UiNode[]; nodes: UiNode[] }> {
    const until = Date.now() + timeoutMs
    for (;;) {
      const nodes = await this.readTree(t)
        .then((r) => r.nodes)
        .catch((e: unknown) => {
          if (e instanceof BridgeError && e.code !== 'failed') throw e
          return [] as UiNode[]
        })
      const hit = matchNodes(nodes, q)
      if (hit.length || Date.now() >= until) return { hit, nodes }
      await sleep(250)
    }
  }

  /**
   * Waits until the screen stops changing (the phone app's idle: no window change for 300 ms,
   * at most 2.5 s), so the next action doesn't land mid-transition. Returns a note for the result.
   */
  private async settle(t: Target): Promise<string> {
    // Give the action a moment to start its transition: checked at once, a page that is about to
    // open still looks idle ("settled in 0 ms", then a screenshot of the old page).
    await sleep(150)
    const r = await bridgeCall(t.adb, t.serial, 'idle', { display: t.displayId, quiet: 300, max: 2500 }).catch(() => null)
    if (r?.ok === true && typeof r.waited === 'number') return r.idle === true ? ` · screen settled (${r.waited} ms)` : ` · screen still changing after ${r.waited} ms (animation, video or loading)`
    await sleep(400) // older phone app or no accessibility: a short pause instead
    return ''
  }

  async tapElement(q: NodeQuery, long: boolean, device?: string, screen?: ScreenChoice, timeoutMs = 2500): Promise<string> {
    const t = await this.target(device, screen)
    const { hit: found, nodes } = await this.findNodes(t, q, timeoutMs)
    if (!found.length) throw new Error(`No element matches ${describeQuery(q)} (looked for ${timeoutMs} ms). Call get_ui_tree or find_elements to see what is on screen.`)
    // Several matches: pressable ones first (a row and the label inside it both match its text).
    const hit = [...found.filter((n) => n.clickable), ...found.filter((n) => !n.clickable)]
    const label = hit[Math.min(q.index ?? 0, hit.length - 1)]!
    // A plain label: press what's around it (its row / card / button).
    const n = clickableAround(nodes, label) ?? label
    const name = label.label || n.label || n.id || n.kind
    if (n.ref) {
      const r = await bridgeCall(t.adb, t.serial, long ? 'long_click' : 'click', { display: t.displayId, ref: n.ref }).catch(() => null)
      if (r?.ok === true) {
        this.log(`${long ? 'long-pressed' : 'pressed'} “${name}”${this.where(t)}`)
        return `${long ? 'Long-pressed' : 'Pressed'} “${name}” at (${n.center[0]}, ${n.center[1]})${await this.settle(t)}`
      }
    }
    return (await this.tapOn(t, n.center[0], n.center[1], long ? 700 : 60)) + (await this.settle(t))
  }

  /**
   * Replaces a text field's content (accessibility set_text: any language, no keyboard needed),
   * then reads the field back. If it doesn't show the text, it clears the field and types instead;
   * if it still doesn't, it fails with what the field shows (never a false "done").
   */
  async setText(value: string, q: NodeQuery, submit: boolean, device?: string, screen?: ScreenChoice, timeoutMs = 2500): Promise<string> {
    const t = await this.target(device, screen)
    const pick = (nodes: UiNode[]): UiNode | undefined => {
      const edits = nodes.filter((n) => n.flags?.includes('editable'))
      const want = q.text || q.id || q.ref ? matchNodes(edits, q) : edits.filter((n) => n.flags?.includes('focused')).concat(edits)
      return want[Math.min(q.index ?? 0, Math.max(want.length - 1, 0))]
    }
    const until = Date.now() + timeoutMs
    let n = pick((await this.readTree(t)).nodes)
    while (!n && Date.now() < until) {
      await sleep(250)
      n = pick((await this.readTree(t)).nodes)
    }
    if (!n) throw new Error('No text field matches. Tap one first, or check get_ui_tree for fields (flags: editable).')
    const field = n
    const name = field.hint || field.id || 'the field'
    const secret = !!field.flags?.includes('password')
    // The same field after the change: same ref, else the editable one at (about) the same place.
    const readBack = async (): Promise<UiNode | undefined> => {
      const nodes = (await this.readTree(t)).nodes
      const near = (a: UiNode): boolean => Math.abs(a.center[0] - field.center[0]) < 40 && Math.abs(a.center[1] - field.center[1]) < 40
      return (field.ref ? nodes.find((x) => x.ref === field.ref && x.flags?.includes('editable')) : undefined) ?? nodes.find((x) => x.flags?.includes('editable') && near(x))
    }
    const shows = async (): Promise<string | null> => {
      await this.settle(t)
      const x = await readBack()
      return x ? fieldText(x) : null
    }

    let how = 'set'
    const r = field.ref ? await bridgeCall(t.adb, t.serial, 'set_text', { display: t.displayId, ref: field.ref, text: value }).catch(() => null) : null
    let now = r?.ok === true ? await shows() : null
    if (secret && r?.ok === true) now = value // password fields read back as dots: trust the action
    if (now === null || !sameFieldText(now, value)) {
      // Fallback: focus it, clear what's there key by key, type the value.
      how = 'typed'
      const current = now ?? fieldText((await readBack()) ?? field)
      await this.tapOn(t, field.center[0], field.center[1], 60)
      await sleep(200)
      await this.clearField(t, current.length)
      await this.typeOn(t, value)
      now = secret ? value : await shows()
      if (now === null) throw new Error(`Typed the text, but the field is gone from the screen, so it can’t be checked. Look with get_ui_tree.`)
      if (!sameFieldText(now, value)) throw new Error(`The field “${name}” shows “${now.slice(0, 200)}” instead of the text. Tap it and try again, or use type_text.`)
    }
    if (submit) await this.keyOn(t, AGENT_KEYS.enter)
    this.log(`filled “${name}”${this.where(t)}`)
    return `Set the text of “${name}” (${how}, checked: the field shows it)${submit ? ' and pressed Enter' + (await this.settle(t)) : ''}`
  }

  /** Clears the focused field: cursor to the end, then Delete once per character (and a few more). */
  private async clearField(t: Target, length: number): Promise<void> {
    const n = Math.min(length + 4, 2000)
    if (t.session) {
      this.key(t, 123) // MOVE_END
      for (let i = 0; i < n; i++) this.key(t, 67) // DEL
      await sleep(Math.min(50 + n * 2, 1500))
    } else {
      await t.adb.runLoose(['shell', 'input', 'keyevent', '123', ...Array<string>(n).fill('67')], t.serial)
    }
  }

  async info(device?: string, screen?: ScreenChoice): Promise<Record<string, unknown>> {
    const t = await this.target(device, screen)
    const sh = (cmd: string): Promise<string> => t.adb.runLoose(['shell', cmd], t.serial).then((s) => s.trim())
    const [release, battery, policy, acts] = await Promise.all([
      sh('getprop ro.build.version.release'),
      sh('dumpsys battery | grep -m1 level'),
      sh('dumpsys window policy'),
      sh('dumpsys activity activities'),
    ])
    const size = await this.screenSize(t)
    const opts = this.deps.options()
    return {
      model: t.device.model,
      id: t.device.id,
      android: release,
      sdk: t.device.sdk,
      screen: t.screen,
      displayId: t.displayId,
      screenSize: size,
      agentSpace: agentSpace(size),
      battery: /level: (\d+)/.exec(battery)?.[1] ?? null,
      // The KeyguardServiceDelegate block (the first "showing=" line can belong to something else).
      phoneLocked: parseKeyguardShowing(policy) === true,
      foregroundApp: parseDisplayTasks(acts, t.displayId)[0] ?? null,
      appsOnThisScreen: parseDisplayTasks(acts, t.displayId),
      controlPath: t.session ? 'scrcpy session' : 'adb input (no mirror open)',
      defaultScreen: opts.workspace,
      allowedByUser: {
        shell: opts.allowShell,
        appChanges: opts.allowAppChanges,
        phoneSettings: opts.allowDeviceSettings,
        filesAndInstalls: opts.allowFiles,
      },
      transports: t.device.transports.map((x) => `${x.kind}:${x.serial}`),
    }
  }

  async details(device?: string): Promise<string> {
    const { adb, device: d } = await this.pickDevice(device)
    const r = await phoneDetails(adb, d.transports[0]!.serial)
    return [`Source: ${r.source}${r.appVersion ? ` (phone app ${r.appVersion})` : ''}`, ...r.sections.map((s) => `## ${s.title}\n${s.rows.map((x) => `${x.label}: ${x.value}`).join('\n')}`)].join('\n\n')
  }

  async listApps(filter?: string, device?: string): Promise<PhoneApp[]> {
    const { adb, device: d } = await this.pickDevice(device)
    const apps = await listApps(adb, d.transports[0]!.serial, this.deps.serverPath(), false)
    if (!filter) return apps
    const f = filter.toLowerCase()
    return apps.filter((a) => a.label.toLowerCase().includes(f) || a.pkg.toLowerCase().includes(f))
  }

  async notifications(app?: string, device?: string): Promise<PhoneNotification[]> {
    const { adb, device: d } = await this.pickDevice(device)
    const out = await adb.runLoose(['shell', 'dumpsys notification --noredact'], d.transports[0]!.serial, 15_000)
    const list = parseNotifications(out)
    this.log('read the notifications')
    return app ? list.filter((n) => n.app === app) : list
  }

  // ---- input ----

  private async toDevice(t: Target, p: Point): Promise<Point> {
    const space = await this.space(t)
    const err = checkPoint(p, space)
    if (err) throw new Error(err)
    return mapPoint(p, space, await this.screenSize(t))
  }

  private async toVideo(t: Target, p: Point): Promise<{ point: Point; size: Size }> {
    const space = await this.space(t)
    const err = checkPoint(p, space)
    if (err) throw new Error(err)
    const size = t.session!.videoSize!
    return { point: mapPoint(p, space, size), size }
  }

  private finger(t: Target, action: number, point: Point, size: Size): void {
    t.session!.sendControl(
      injectTouch({
        action,
        pointerId: PointerId.GENERIC_FINGER,
        position: { x: point.x, y: point.y, screen: size },
        pressure: action === MotionAction.UP ? 0 : 1,
        actionButton: 0,
        buttons: 0,
      }),
    )
  }

  private async tapOn(t: Target, x: number, y: number, holdMs: number): Promise<string> {
    if (t.session?.videoSize) {
      const { point, size } = await this.toVideo(t, { x, y })
      this.finger(t, MotionAction.DOWN, point, size)
      await sleep(holdMs)
      this.finger(t, MotionAction.UP, point, size)
    } else {
      const d = await this.toDevice(t, { x, y })
      if (holdMs > 300) await t.adb.runLoose(['shell', 'input', 'swipe', `${d.x}`, `${d.y}`, `${d.x}`, `${d.y}`, `${holdMs}`], t.serial)
      else await t.adb.runLoose(['shell', 'input', 'tap', `${d.x}`, `${d.y}`], t.serial)
    }
    this.log(`${holdMs > 300 ? 'long-pressed' : 'tapped'} (${x}, ${y})${this.where(t)}`)
    return `${holdMs > 300 ? 'Long-pressed' : 'Tapped'} (${x}, ${y})`
  }

  async tap(x: number, y: number, device?: string, holdMs = 60, screen?: ScreenChoice): Promise<string> {
    const t = await this.target(device, screen)
    return (await this.tapOn(t, x, y, holdMs)) + (await this.settle(t))
  }

  async swipe(from: Point, to: Point, durationMs = 300, device?: string, screen?: ScreenChoice): Promise<string> {
    const t = await this.target(device, screen)
    const ms = Math.min(Math.max(durationMs, 50), 5000)
    if (t.session?.videoSize) {
      const a = await this.toVideo(t, from)
      const b = await this.toVideo(t, to)
      const steps = Math.max(6, Math.round(ms / 16))
      this.finger(t, MotionAction.DOWN, a.point, a.size)
      for (let i = 1; i <= steps; i++) {
        await sleep(ms / steps)
        const f = i / steps
        this.finger(t, MotionAction.MOVE, { x: Math.round(a.point.x + (b.point.x - a.point.x) * f), y: Math.round(a.point.y + (b.point.y - a.point.y) * f) }, a.size)
      }
      this.finger(t, MotionAction.UP, b.point, a.size)
    } else {
      const a = await this.toDevice(t, from)
      const b = await this.toDevice(t, to)
      await t.adb.runLoose(['shell', 'input', 'swipe', `${a.x}`, `${a.y}`, `${b.x}`, `${b.y}`, `${ms}`], t.serial)
    }
    this.log(`swiped (${from.x}, ${from.y}) → (${to.x}, ${to.y})${this.where(t)}`)
    return `Swiped (${from.x}, ${from.y}) → (${to.x}, ${to.y}) in ${ms} ms${await this.settle(t)}`
  }

  /** Scrolls the content by dragging in the middle of the screen. `amount` = fraction of the screen. */
  async scroll(direction: 'up' | 'down' | 'left' | 'right', amount = 0.5, device?: string, screen?: ScreenChoice): Promise<string> {
    const t = await this.target(device, screen)
    const s = await this.space(t)
    const f = Math.min(Math.max(amount, 0.1), 0.9)
    const cx = Math.round(s.width / 2)
    const cy = Math.round(s.height / 2)
    const dx = Math.round((s.width * f) / 2)
    const dy = Math.round((s.height * f) / 2)
    // Content moves opposite to the finger: to scroll down (see what's below), drag upward.
    const [from, to] =
      direction === 'down'
        ? [{ x: cx, y: cy + dy }, { x: cx, y: cy - dy }]
        : direction === 'up'
          ? [{ x: cx, y: cy - dy }, { x: cx, y: cy + dy }]
          : direction === 'right'
            ? [{ x: cx + dx, y: cy }, { x: cx - dx, y: cy }]
            : [{ x: cx - dx, y: cy }, { x: cx + dx, y: cy }]
    // Did anything move? Compare what's on screen before and after (needs the element tree).
    const sig = async (): Promise<string | null> =>
      this.readTree(t)
        .then((r) => screenSignature(r.nodes))
        .catch(() => null)
    const before = await sig()
    await this.swipe(from, to, 350, device, t.screen)
    if (before === null) return `Scrolled ${direction} (can’t tell whether the content moved without the element tree)`
    if ((await sig()) !== before) return `Scrolled ${direction}: the content moved.`
    // The drag didn't move anything (e.g. it started on something that isn't scrollable): ask the
    // biggest scrollable element to scroll instead.
    const forward = direction === 'down' || direction === 'right'
    const scrollables = (await this.readTree(t)).nodes.filter((n) => n.flags?.includes('scrollable') && n.ref)
    const area = (n: UiNode): number => (n.bounds[2] - n.bounds[0]) * (n.bounds[3] - n.bounds[1])
    const big = scrollables.sort((a, b) => area(b) - area(a))[0]
    if (big) {
      await bridgeCall(t.adb, t.serial, forward ? 'scroll_forward' : 'scroll_backward', { display: t.displayId, ref: big.ref }).catch(() => null)
      await this.settle(t)
      if ((await sig()) !== before) return `Scrolled ${direction}: the content moved (scrolled “${big.label || big.id || big.kind}” directly).`
    }
    return `Scrolled ${direction}, but nothing moved: probably already at the ${forward ? 'end' : 'start'}${scrollables.length ? '' : ', or nothing here scrolls'}. Check with screenshot or get_ui_tree.`
  }

  private async typeOn(t: Target, text: string): Promise<void> {
    const ascii = /^[\x20-\x7e]*$/.test(text)
    if (t.session) {
      if (ascii) for (let i = 0; i < text.length; i += 250) t.session.sendControl(injectText(text.slice(i, i + 250)))
      // Non-ASCII: put it on the phone clipboard and paste (scrcpy SET_CLIPBOARD with paste).
      else t.session.sendControl(setClipboard(BigInt(Date.now()), text, true))
    } else {
      if (!ascii) throw new Error('Non-ASCII text needs an open mirror session (it is pasted via the clipboard), or use set_text.')
      await t.adb.runLoose(['shell', 'input', 'text', escapeInputText(text)], t.serial)
    }
  }

  async typeText(text: string, submit = false, device?: string, screen?: ScreenChoice): Promise<string> {
    const t = await this.target(device, screen)
    await this.typeOn(t, text)
    if (submit) {
      await sleep(80)
      await this.keyOn(t, AGENT_KEYS.enter)
    }
    this.log(`typed ${text.length} character(s)${this.where(t)}`)
    return `Typed ${text.length} character(s)${submit ? ' and pressed Enter' + (await this.settle(t)) : ''}`
  }

  private key(t: Target, code: number): void {
    t.session!.sendControl(injectKeycode(KeyAction.DOWN, code))
    t.session!.sendControl(injectKeycode(KeyAction.UP, code))
  }

  private async keyOn(t: Target, code: number): Promise<void> {
    if (t.session) this.key(t, code)
    else await t.adb.runLoose(['shell', 'input', 'keyevent', String(code)], t.serial)
  }

  async pressKey(key: AgentKey, device?: string, screen?: ScreenChoice): Promise<string> {
    const t = await this.target(device, screen)
    await this.keyOn(t, AGENT_KEYS[key])
    this.log(`pressed ${key}${this.where(t)}`)
    return `Pressed ${key}${await this.settle(t)}`
  }

  /** `app`: a package name or an app's label ("WhatsApp"). */
  async launchApp(app: string, device?: string, screen?: ScreenChoice): Promise<string> {
    const t = await this.target(device, screen)
    let pkg = app.trim()
    if (!/^[\w]+(\.[\w]+)+$/.test(pkg)) {
      const apps = await listApps(t.adb, t.serial, this.deps.serverPath(), false)
      const q = pkg.toLowerCase()
      const hit = apps.find((a) => a.label.toLowerCase() === q) ?? apps.find((a) => a.label.toLowerCase().includes(q))
      if (!hit) throw new Error(`No app called "${app}". Call list_apps.`)
      pkg = hit.pkg
    }
    if (t.screen === 'agent') {
      // Android shows no apps on any display while the phone is locked: say so instead of
      // launching onto the lock screen (where the task would then stay, on the phone's screen).
      const policy = await t.adb.runLoose(['shell', 'dumpsys window policy'], t.serial)
      if (parseKeyguardShowing(policy) === true) throw new Error('The phone is locked, so apps can’t open on any screen. Call unlock_phone (the user approves with Touch ID) or ask the user to unlock it.')
    }
    if (t.session) t.session.sendControl(startApp(pkg))
    else {
      const out = await t.adb.runLoose(['shell', 'monkey', '-p', pkg, '-c', 'android.intent.category.LAUNCHER', '1'], t.serial)
      if (/No activities found|monkey aborted/i.test(out)) throw new Error(`could not launch ${pkg}: ${out.trim()}`)
    }
    if (t.screen === 'agent' && t.displayId) {
      // START_APP brings an existing task forward where it already is: if the app was open on
      // the phone's screen it would come up there. Move its task onto the agent screen.
      await sleep(600)
      const acts = await t.adb.runLoose(['shell', 'dumpsys activity activities'], t.serial, 10_000)
      const elsewhere = findTaskOutside(acts, pkg, t.displayId)
      if (elsewhere !== null) await t.adb.runLoose(['shell', `cmd activity display move-stack ${elsewhere} ${t.displayId}`], t.serial)
    }
    this.log(`opened ${pkg}${this.where(t)}`)
    return `Launched ${pkg}${this.where(t)}`
  }

  async openUrl(url: string, device?: string, screen?: ScreenChoice): Promise<string> {
    const t = await this.target(device, screen)
    const u = validUri(url)
    if (!u) throw new Error('Pass a link: https://…, mailto:, tel:, geo:, market://, or an app deep link like myapp://screen.')
    const display = t.displayId ? `--display ${t.displayId} ` : ''
    const out = await t.adb.runLoose(['shell', `am start ${display}-a android.intent.action.VIEW -d ${shellQuote(u)}`], t.serial, 10_000)
    if (/Error|Exception/.test(out)) throw new Error(out.trim().split('\n').pop() ?? 'The phone could not open it.')
    this.log(`opened ${u}${this.where(t)}`)
    return `Opened ${u}${this.where(t)}`
  }

  async stopApp(pkg: string, device?: string): Promise<string> {
    const { adb, device: d } = await this.pickDevice(device)
    if (!/^[\w]+(\.[\w]+)+$/.test(pkg)) throw new Error('package must look like com.example.app (see list_apps)')
    await adb.runLoose(['shell', `am force-stop ${pkg}`], d.transports[0]!.serial)
    this.log(`stopped ${pkg}`)
    return `Force-stopped ${pkg}`
  }

  async logcat(opts: { pkg?: string; lines?: number; level?: 'V' | 'D' | 'I' | 'W' | 'E'; grep?: string; quiet?: boolean }, device?: string): Promise<string> {
    const { adb, device: d } = await this.pickDevice(device)
    const n = Math.min(Math.max(opts.lines ?? 200, 10), 2000)
    const filter = opts.level ? ` '*:${opts.level}'` : ''
    let cmd = `logcat -d -t ${n}${filter}`
    if (opts.pkg) {
      if (!/^[\w]+(\.[\w]+)+$/.test(opts.pkg)) throw new Error('package must look like com.example.app')
      cmd = `p=$(pidof -s ${opts.pkg}); if [ -n "$p" ]; then logcat -d -t ${n} --pid=$p${filter}; else echo "${opts.pkg} is not running"; fi`
    }
    let out = await adb.runLoose(['shell', cmd], d.transports[0]!.serial, 20_000)
    if (opts.grep) {
      const g = opts.grep.toLowerCase()
      out = out.split('\n').filter((l) => l.toLowerCase().includes(g)).join('\n')
    }
    if (!opts.quiet) this.log('read the log')
    return out.length > 60_000 ? `…${out.slice(-60_000)}` : out || '(empty)'
  }

  async pushFile(macPath: string, phoneDir = '/sdcard/Download', device?: string): Promise<string> {
    this.allow('allowFiles')
    const { adb, device: d } = await this.pickDevice(device)
    if (!isAbsolute(macPath) || !statSync(macPath).isFile()) throw new Error('mac_path must be an absolute path to a file on this Mac')
    if (!/^\/(sdcard|storage|data\/local\/tmp)\//.test(`${phoneDir.replace(/\/$/, '')}/`)) throw new Error('phone_dir must be under /sdcard, /storage or /data/local/tmp')
    const dest = `${phoneDir.replace(/\/$/, '')}/${basename(macPath)}`
    const serial = d.transports[0]!.serial
    await adb.push(serial, macPath, dest)
    this.deps.findSession(d.transports.map((x) => x.serial), 'phone')?.session.sendControl(scanFile(dest)) // show in Gallery / Files
    this.log(`copied ${basename(macPath)} to the phone`)
    return `Copied to ${dest}`
  }

  async pullFile(phonePath: string, device?: string): Promise<string> {
    this.allow('allowFiles')
    const { adb, device: d } = await this.pickDevice(device)
    if (!phonePath.startsWith('/')) throw new Error('phone_path must be absolute, e.g. /sdcard/Download/x.pdf')
    mkdirSync(pullFolder(), { recursive: true })
    const dest = join(pullFolder(), basename(phonePath))
    const { stdout } = await execFileP(adb.path, ['-s', d.transports[0]!.serial, 'exec-out', 'cat', phonePath], { encoding: 'buffer', maxBuffer: 512 * 1024 * 1024, timeout: 120_000 })
    if (!stdout.length) throw new Error(`Could not read ${phonePath} (missing, empty or not readable by adb)`)
    writeFileSync(dest, stdout)
    this.log(`copied ${basename(phonePath)} to the Mac`)
    return `Saved ${stdout.length} bytes to ${dest}`
  }

  async listFiles(phoneDir: string, device?: string): Promise<string> {
    this.allow('allowFiles')
    const { adb, device: d } = await this.pickDevice(device)
    if (!phoneDir.startsWith('/')) throw new Error('path must be absolute, e.g. /sdcard/Download')
    return (await adb.runLoose(['shell', `ls -la ${shellQuote(phoneDir)}`], d.transports[0]!.serial, 15_000)).trim()
  }

  async installApk(macPath: string, device?: string): Promise<string> {
    this.allow('allowFiles')
    const { adb, device: d } = await this.pickDevice(device)
    if (!isAbsolute(macPath) || !macPath.toLowerCase().endsWith('.apk') || !statSync(macPath).isFile()) throw new Error('apk_path must be an absolute path to an .apk on this Mac')
    const out = (await adb.runLoose(['install', '-r', macPath], d.transports[0]!.serial, 300_000)).trim()
    if (!/\bSuccess\b/.test(out)) throw new Error(out.split('\n').pop() || out)
    this.log(`installed ${basename(macPath)}`)
    return `Installed ${basename(macPath)}`
  }

  async setClipboard(text: string, device?: string, screen?: ScreenChoice): Promise<string> {
    const t = await this.target(device, screen)
    if (!t.session) throw new Error('Needs a session (agent screen or an open mirror).')
    t.session.sendControl(setClipboard(BigInt(Date.now()), text, false))
    this.log('put text on the phone clipboard')
    return 'Copied to the phone clipboard'
  }

  async shell(command: string, device?: string): Promise<string> {
    this.allow('allowShell')
    const { adb, device: d } = await this.pickDevice(device)
    this.log(`ran a shell command: ${command.slice(0, 60)}`)
    const out = await adb.runLoose(['shell', command], d.transports[0]!.serial, 30_000)
    return out.length > 60_000 ? `…${out.slice(-60_000)}` : out || '(no output)'
  }


  // ---- screen map ----

  /**
   * Exact layout of a screen in dp (see screen-map.ts), with an annotated image: numbered boxes
   * and sizes drawn on the live frame, optionally an N-dp grid. Needs the phone app's agent service.
   */
  async screenMap(
    o: { app?: string; includeSystem?: boolean; detail?: 'compact' | 'full'; maxNodes?: number; image?: boolean; gridDp?: number; colors?: boolean },
    device?: string,
    screen?: ScreenChoice,
  ): Promise<{ map: ScreenMap; image: string | null }> {
    const t = await this.target(device, screen)
    const size = await this.screenSize(t)
    let dpi = t.session?.displayDpi ?? null
    if (!dpi) {
      const out = await t.adb.runLoose(['shell', 'wm density'], t.serial)
      dpi = Number(/Override density: (\d+)/.exec(out)?.[1] ?? /Physical density: (\d+)/.exec(out)?.[1] ?? 0) || 420
    }
    const fs = Number((await t.adb.runLoose(['shell', 'settings get system font_scale'], t.serial)).trim())
    const display = { width: size.width, height: size.height, dpi, fontScale: Number.isFinite(fs) && fs > 0 ? fs : 1 }
    const raw = await bridgeCall(t.adb, t.serial, 'map', { display: t.displayId, limit: Math.min(Math.max(o.maxNodes ?? 600, 20), 2000), rendering: true })
    const map = buildScreenMap(raw, display, {
      app: o.app,
      includeSystem: o.includeSystem,
      compact: (o.detail ?? 'compact') === 'compact',
      agent: agentSpace(size),
    })
    if (o.colors !== false && t.live) {
      const png = await t.live.capture().catch(() => null)
      if (png) {
        const img = nativeImage.createFromBuffer(Buffer.from(png))
        const s = img.getSize()
        if (!img.isEmpty()) map.summary.colors = sampleColors(img.toBitmap(), s.width, s.height, display, map.nodes)
      }
    }
    let image: string | null = null
    if (o.image !== false && t.live) {
      // Big enough to read the labels: the long side 1600 px (never above the display's own size).
      const k = Math.min(1, 1600 / Math.max(size.width, size.height))
      const out = { width: Math.round(size.width * k), height: Math.round(size.height * k) }
      const boxes = map.nodes.map((n) => ({
        x: n.px[0] * k,
        y: n.px[1] * k,
        w: (n.px[2] - n.px[0]) * k,
        h: (n.px[3] - n.px[1]) * k,
        label: `${n.n} · ${n.w}×${n.h}`,
        depth: n.depth,
      }))
      const grid = o.gridDp && o.gridDp >= 2 ? o.gridDp * (dpi / 160) * k : undefined
      const jpeg = await t.live.capture(out, { boxes, grid }).catch(() => null)
      if (jpeg?.length) image = Buffer.from(jpeg).toString('base64')
    }
    this.log(`mapped the screen’s layout${this.where(t)}`)
    return { map, image }
  }

  // ---- app testing ----

  private pkgOk(pkg: string): string {
    if (!/^[A-Za-z][\w]*(\.[\w]+)+$/.test(pkg)) throw new Error('package must look like com.example.app (see list_apps)')
    return pkg
  }

  private async sh(device: string | undefined, cmd: string, timeout = 20_000): Promise<{ out: string; adb: Adb; serial: string; device: Device }> {
    const { adb, device: d } = await this.pickDevice(device)
    const serial = d.transports[0]!.serial
    return { out: await adb.runLoose(['shell', cmd], serial, timeout), adb, serial, device: d }
  }

  async appInfo(pkg: string, device?: string): Promise<PackageFacts & { running: boolean }> {
    this.pkgOk(pkg)
    const { out, adb, serial } = await this.sh(device, `dumpsys package ${pkg}`)
    const facts = parsePackageDump(pkg, out)
    if (!facts) throw new Error(`${pkg} is not installed`)
    const pid = (await adb.runLoose(['shell', `pidof -s ${pkg}`], serial)).trim()
    return { ...facts, running: !!pid }
  }

  async clearData(pkg: string, device?: string): Promise<string> {
    this.allow('allowAppChanges')
    this.pkgOk(pkg)
    if (pkg === 'com.mobmirror.companion') throw new Error('That is Twinglass’ own phone app.')
    const { out } = await this.sh(device, `pm clear ${pkg}`)
    if (!/Success/.test(out)) throw new Error(out.trim() || 'pm clear failed')
    this.log(`cleared the data of ${pkg}`)
    return `Cleared all data of ${pkg} (fresh install state)`
  }

  async uninstall(pkg: string, keepData: boolean, device?: string): Promise<string> {
    this.allow('allowAppChanges')
    this.pkgOk(pkg)
    if (pkg === 'com.mobmirror.companion') throw new Error('That is Twinglass’ own phone app.')
    const { out } = await this.sh(device, `pm uninstall ${keepData ? '-k ' : ''}${pkg}`, 60_000)
    if (!/Success/.test(out)) throw new Error(out.trim() || 'uninstall failed')
    this.log(`uninstalled ${pkg}`)
    return `Uninstalled ${pkg}`
  }

  async permission(pkg: string, perm: string, grant: boolean, device?: string): Promise<string> {
    this.allow('allowAppChanges')
    this.pkgOk(pkg)
    const p = perm.includes('.') ? perm : `android.permission.${perm}`
    if (!/^[\w.]+$/.test(p)) throw new Error('permission must look like android.permission.CAMERA (or CAMERA)')
    const { out } = await this.sh(device, `pm ${grant ? 'grant' : 'revoke'} ${pkg} ${p}`)
    if (/Exception|Error|not a changeable/i.test(out)) throw new Error(out.trim().split('\n')[0] ?? 'failed')
    this.log(`${grant ? 'granted' : 'revoked'} ${p.replace('android.permission.', '')} for ${pkg}`)
    return `${grant ? 'Granted' : 'Revoked'} ${p} for ${pkg}`
  }

  async resetPermissions(pkg: string, device?: string): Promise<string> {
    this.allow('allowAppChanges')
    this.pkgOk(pkg)
    await this.sh(device, `pm reset-permissions -p ${pkg}`)
    return `Reset the runtime permissions of ${pkg} (it will ask again)`
  }

  async crashes(pkg: string | undefined, lines: number, device?: string, quiet = false): Promise<string> {
    const { out } = await this.sh(device, `logcat -b crash -d -t ${Math.min(Math.max(lines, 20), 3000)}`)
    let text = out
    if (pkg) {
      this.pkgOk(pkg)
      // Keep whole crash blocks that mention the package.
      const blocks = out.split(/\n(?=--------- beginning of|\S+ \S+ +\d+ +\d+ E AndroidRuntime: FATAL EXCEPTION)/)
      text = blocks.filter((b) => b.includes(pkg)).join('\n')
    }
    if (!quiet) this.log('read the crash log')
    return text.trim() ? (text.length > 60_000 ? `…${text.slice(-60_000)}` : text) : 'No crashes recorded.'
  }

  /**
   * am start with an explicit component / action / data / extras. cold: force-stop first.
   * Returns the launch time Android measured (-W).
   */
  async startActivity(
    o: { pkg?: string; component?: string; action?: string; data?: string; extras?: Record<string, string | number | boolean>; cold?: boolean; clearTask?: boolean },
    device?: string,
    screen?: ScreenChoice,
  ): Promise<string> {
    const t = await this.target(device, screen)
    let comp = o.component
    if (!comp && o.pkg && !o.action && !o.data) {
      this.pkgOk(o.pkg)
      const r = await t.adb.runLoose(['shell', `cmd package resolve-activity --brief -c android.intent.category.LAUNCHER ${o.pkg}`], t.serial)
      comp = r.trim().split('\n').pop()
      if (!comp?.includes('/')) throw new Error(`${o.pkg} has no launcher activity`)
    }
    const args = ['am start -W']
    if (t.displayId) args.push(`--display ${t.displayId}`)
    if (o.cold) args.push('-S')
    if (o.clearTask) args.push('-f 0x10008000') // NEW_TASK | CLEAR_TASK
    if (comp) {
      if (!/^[\w.]+\/[\w.$]+$/.test(comp)) throw new Error('component must look like com.app/.MainActivity')
      args.push(`-n ${comp}`)
    }
    if (o.action) {
      if (!/^[\w.]+$/.test(o.action)) throw new Error('action must look like android.intent.action.VIEW')
      args.push(`-a ${o.action}`)
    }
    if (o.data) {
      const u = validUri(o.data)
      if (!u) throw new Error('data must be a URI')
      args.push(`-d ${shellQuote(u)}`)
    }
    if (o.pkg && !comp) args.push(this.pkgOk(o.pkg))
    for (const [k, v] of Object.entries(o.extras ?? {})) {
      if (!/^[\w.]+$/.test(k)) throw new Error(`bad extra key "${k}"`)
      if (typeof v === 'boolean') args.push(`--ez ${k} ${v}`)
      else if (typeof v === 'number') args.push(Number.isInteger(v) ? `--el ${k} ${v}` : `--ef ${k} ${v}`)
      else args.push(`--es ${k} ${shellQuote(v)}`)
    }
    const out = await t.adb.runLoose(['shell', args.join(' ')], t.serial, 30_000)
    if (/Error:|Exception/.test(out)) throw new Error(out.trim().split('\n').filter((l) => /Error|Exception/.test(l)).join('\n'))
    const ms = parseLaunchTime(out)
    this.log(`started ${comp ?? o.action ?? o.pkg}${this.where(t)}`)
    return `Started ${comp ?? o.data ?? o.action}${this.where(t)}${ms !== null ? `; launch took ${ms} ms${o.cold ? ' (cold start)' : ''}` : ''}`
  }

  /** Frame, memory and CPU numbers for an app (the developer panel's graph). Quiet: not logged. */
  async perfStats(pkg: string, device?: string): Promise<{ frames: number; jankyPercent: number; p50: number; p90: number; pssMb: number | null; cpu: number | null } | null> {
    this.pkgOk(pkg)
    const { adb, serial } = await this.sh(device, 'true')
    const [gfx = '', mem = '', cpu = ''] = await adb.shellBatch(serial, [`dumpsys gfxinfo ${pkg}`, `dumpsys meminfo ${pkg}`, 'dumpsys cpuinfo'])
    const f = parseGfxinfo(gfx)
    const pss = parseMeminfoPss(mem)
    const c = parseCpuinfo(pkg, cpu)
    if (!f && pss === null) return null
    return { frames: f?.frames ?? 0, jankyPercent: f?.jankyPercent ?? 0, p50: f?.p50 ?? 0, p90: f?.p90 ?? 0, pssMb: pss !== null ? Math.round((pss / 1024) * 10) / 10 : null, cpu: c }
  }

  async performance(pkg: string, reset: boolean, device?: string): Promise<string> {
    this.pkgOk(pkg)
    const { adb, serial } = await this.sh(device, 'true')
    const [gfx = '', mem = '', cpu = ''] = await adb.shellBatch(serial, [`dumpsys gfxinfo ${pkg}`, `dumpsys meminfo ${pkg}`, 'dumpsys cpuinfo'])
    if (reset) await adb.runLoose(['shell', `dumpsys gfxinfo ${pkg} reset`], serial)
    const f = parseGfxinfo(gfx)
    const pss = parseMeminfoPss(mem)
    const c = parseCpuinfo(pkg, cpu)
    this.log(`measured ${pkg}`)
    return [
      f
        ? `Frames: ${f.frames} rendered, ${f.janky} janky (${f.jankyPercent}%). Frame time p50 ${f.p50} ms, p90 ${f.p90} ms, p95 ${f.p95} ms, p99 ${f.p99} ms.`
        : `Frames: no data (is ${pkg} running and drawing?)`,
      `Memory: ${pss !== null ? `${(pss / 1024).toFixed(1)} MB PSS` : 'not running'}`,
      `CPU (recent): ${c !== null ? `${c}%` : 'idle or not running'}`,
      reset ? 'Frame stats reset: interact, then call again to measure just that.' : 'Pass reset=true to start a fresh measurement window.',
    ].join('\n')
  }

  /** Phone settings for testing. Each first change remembers the value before; reset puts them all back. */
  async setDeviceState(
    o: {
      dark_mode?: boolean
      font_scale?: number
      animations?: boolean
      density?: number | null
      wifi?: boolean
      mobile_data?: boolean
      airplane?: boolean
      battery_level?: number
      charging?: boolean
      reset?: boolean
    },
    device?: string,
  ): Promise<string> {
    // Putting settings back is always allowed.
    if (!o.reset) this.allow('allowDeviceSettings')
    const { adb, device: d } = await this.pickDevice(device)
    const serial = d.transports[0]!.serial
    const sh = (c: string): Promise<string> => adb.runLoose(['shell', c], serial, 15_000).then((x) => x.trim())
    const before = this.changed.get(d.id) ?? new Map<string, string>()
    this.changed.set(d.id, before)
    const remember = async (key: string, read: () => Promise<string>): Promise<void> => {
      if (!before.has(key)) before.set(key, await read())
    }
    const done: string[] = []
    if (o.reset) {
      for (const [k, v] of before) {
        if (k === 'night') await sh(`cmd uimode night ${/yes/.test(v) ? 'yes' : /auto/.test(v) ? 'auto' : 'no'}`)
        else if (k === 'density') await sh(/Override density: (\d+)/.test(v) ? `wm density ${/Override density: (\d+)/.exec(v)![1]}` : 'wm density reset')
        else if (k === 'battery') await sh('dumpsys battery reset')
        else if (k === 'wifi') await sh(`svc wifi ${v === '1' ? 'enable' : 'disable'}`)
        else if (k === 'data') await sh(`svc data ${v === '1' ? 'enable' : 'disable'}`)
        else if (k === 'airplane') await sh(`cmd connectivity airplane-mode ${v === '1' ? 'enable' : 'disable'}`)
        else {
          const [ns, name] = k.split(':') as [string, string]
          await sh(v === 'null' || v === '' ? `settings delete ${ns} ${name}` : `settings put ${ns} ${name} ${shellQuote(v)}`)
        }
      }
      const n = before.size
      before.clear()
      this.log('put the phone settings back')
      return n ? `Restored ${n} setting(s) to how they were before.` : 'Nothing to restore.'
    }
    const wifiOnly = d.transports.every((t) => t.kind === 'wifi')
    if ((o.wifi === false || o.airplane === true) && wifiOnly) {
      throw new Error('The phone is connected to this Mac over Wi-Fi only: turning Wi-Fi off (or airplane mode on) would cut the connection. Connect a USB cable first.')
    }
    if (o.dark_mode !== undefined) {
      await remember('night', () => sh('cmd uimode night'))
      await sh(`cmd uimode night ${o.dark_mode ? 'yes' : 'no'}`)
      done.push(`dark mode ${o.dark_mode ? 'on' : 'off'}`)
    }
    if (o.font_scale !== undefined) {
      const f = Math.min(Math.max(o.font_scale, 0.85), 2)
      await remember('system:font_scale', () => sh('settings get system font_scale'))
      await sh(`settings put system font_scale ${f}`)
      done.push(`font scale ${f}`)
    }
    if (o.animations !== undefined) {
      for (const k of ['window_animation_scale', 'transition_animation_scale', 'animator_duration_scale']) {
        await remember(`global:${k}`, () => sh(`settings get global ${k}`))
        await sh(`settings put global ${k} ${o.animations ? 1 : 0}`)
      }
      done.push(`animations ${o.animations ? 'on' : 'off'}`)
    }
    if (o.density !== undefined) {
      await remember('density', () => sh('wm density'))
      await sh(o.density === null ? 'wm density reset' : `wm density ${Math.round(Math.min(Math.max(o.density, 120), 800))}`)
      done.push(o.density === null ? 'density reset' : `density ${o.density} dpi`)
    }
    if (o.wifi !== undefined) {
      await remember('wifi', () => sh('settings get global wifi_on'))
      await sh(`svc wifi ${o.wifi ? 'enable' : 'disable'}`)
      done.push(`Wi-Fi ${o.wifi ? 'on' : 'off'}`)
    }
    if (o.mobile_data !== undefined) {
      await remember('data', () => sh('settings get global mobile_data'))
      await sh(`svc data ${o.mobile_data ? 'enable' : 'disable'}`)
      done.push(`mobile data ${o.mobile_data ? 'on' : 'off'}`)
    }
    if (o.airplane !== undefined) {
      await remember('airplane', () => sh('settings get global airplane_mode_on'))
      await sh(`cmd connectivity airplane-mode ${o.airplane ? 'enable' : 'disable'}`)
      done.push(`airplane mode ${o.airplane ? 'on' : 'off'}`)
    }
    if (o.battery_level !== undefined || o.charging !== undefined) {
      before.set('battery', 'reset')
      if (o.battery_level !== undefined) await sh(`dumpsys battery set level ${Math.round(Math.min(Math.max(o.battery_level, 0), 100))}`)
      if (o.charging === false) await sh('dumpsys battery unplug')
      if (o.charging === true) await sh('dumpsys battery set ac 1')
      done.push(`battery shown as ${o.battery_level ?? '(same)'}%${o.charging === undefined ? '' : o.charging ? ', charging' : ', not charging'}`)
    }
    this.log(`changed phone settings: ${done.join(', ')}`)
    return done.length ? `Set ${done.join(', ')}. Call set_device_state {reset:true} when done to put them back.` : 'Nothing to change.'
  }

  /** adb reverse: lets the phone reach a server on this Mac at localhost:<port> (dev servers, mocks). */
  async reversePort(action: 'add' | 'remove' | 'list', phonePort?: number, macPort?: number, device?: string): Promise<string> {
    const { adb, device: d } = await this.pickDevice(device)
    const serial = d.transports[0]!.serial
    const port = (p: number | undefined): number => {
      if (!p || !Number.isInteger(p) || p < 1 || p > 65535) throw new Error('ports are 1–65535')
      return p
    }
    if (action === 'list') return (await adb.runLoose(['reverse', '--list'], serial)).trim() || 'No reverse ports.'
    if (action === 'remove') {
      await adb.runLoose(['reverse', '--remove', `tcp:${port(phonePort)}`], serial)
      return `Removed tcp:${phonePort}`
    }
    await adb.runLoose(['reverse', `tcp:${port(phonePort)}`, `tcp:${port(macPort ?? phonePort)}`], serial)
    this.log(`connected phone port ${phonePort} to the Mac`)
    return `The phone’s localhost:${phonePort} now reaches this Mac’s localhost:${macPort ?? phonePort}`
  }

  async record(on: boolean, device?: string, screen?: ScreenChoice): Promise<string> {
    const t = await this.target(device, screen)
    if (!t.live) throw new Error('Recording needs a window for that screen: mirror the phone in Twinglass, or use the agent screen.')
    const path = await this.deps.record(t.live.webContentsId, on)
    this.log(on ? `started recording${this.where(t)}` : 'stopped recording')
    return on ? `Recording the ${t.screen} screen. Call record_screen {action:"stop"} to save it.` : path ? `Saved the recording to ${path}` : 'Stopped (no file was being recorded).'
  }

  async unlock(device?: string): Promise<string> {
    const t = await this.target(device, 'phone')
    if (!t.session) throw new Error('Unlocking needs an open mirror of the phone’s screen in Twinglass.')
    this.log('asked to unlock: waiting for Touch ID on the Mac')
    const r = await this.deps.unlock(t.adb, t.session)
    if (!r.ok) throw new Error(r.message)
    return r.message
  }
}

/**
 * Root task id of `pkg` when it sits on a display other than `displayId` (in `dumpsys activity
 * activities`: "Display #0 (activities…" sections with "* Task{… #5807 type=standard A=10366:pkg").
 */
export function findTaskOutside(dump: string, pkg: string, displayId: number): number | null {
  let display: number | null = null
  for (const line of dump.split('\n')) {
    const d = /^Display #(\d+) /.exec(line)
    if (d) {
      display = Number(d[1])
      continue
    }
    if (/^\S/.test(line)) display = null
    if (display === null || display === displayId) continue
    const t = /^ {2}\* Task\{\S+ #(\d+) type=standard (?:A=\d+:|I=)([\w.]+)/.exec(line)
    if (t && t[2] === pkg) return Number(t[1])
  }
  return null
}

export function describeQuery(q: NodeQuery): string {
  return [q.text && `text “${q.text}”`, q.id && `id “${q.id}”`, q.ref && `ref ${q.ref}`].filter(Boolean).join(' + ') || 'any element'
}
