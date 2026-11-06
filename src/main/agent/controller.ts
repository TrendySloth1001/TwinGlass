// Device control for coding agents (used by the MCP server). Agents work in "agent space": the
// coordinate system of the screenshots they receive (longest side AGENT_MAX_DIM px).
//
// Injection paths:
//  - a live mirror session for the phone -> scrcpy control socket (fast, same as the user's mouse)
//  - otherwise -> `adb shell input …` (slower, no mirror needed)
// Screenshots: the live mirror frame from the window (~tens of ms) or `adb exec-out screencap`
// (~1.1 s on the test phone). Both honour FLAG_SECURE (secure screens come back black).
import { execFile } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { promisify } from 'node:util'
import { nativeImage } from 'electron'
import { AndroidKey } from '@shared/input/keycodes'
import { KeyAction, MotionAction, PointerId } from '@shared/scrcpy/constants'
import { injectKeycode, injectText, injectTouch, setClipboard, startApp, type Size } from '@shared/scrcpy/control'
import type { Adb, Device } from '../adb/adb'
import type { ScrcpySession } from '../scrcpy/session'
import { agentSpace, checkPoint, mapPoint, type Point } from './geometry'
import { escapeInputText, parseUiDump, type UiNode } from './ui-tree'

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

export interface Screenshot {
  /** base64 JPEG */
  data: string
  mimeType: 'image/jpeg'
  width: number
  height: number
  source: 'mirror' | 'screencap'
}

export interface ControllerDeps {
  adb: () => Adb | null
  /** Live mirror session for a transport serial of this phone, if any. */
  findSession: (transportSerials: string[]) => { session: ScrcpySession; capture: () => Promise<Uint8Array | null> } | null
  /** Unlock with the user's saved PIN after Touch ID approval on the Mac. */
  unlock: (adb: Adb, session: ScrcpySession) => Promise<{ ok: boolean; message: string }>
}

interface Target {
  adb: Adb
  device: Device
  serial: string
  session: ScrcpySession | null
  capture: (() => Promise<Uint8Array | null>) | null
}

export class DeviceController extends EventEmitter<{ activity: [string] }> {
  /** Last known screen size in device pixels (from screencap/wm size), per device id. */
  private screens = new Map<string, Size>()

  constructor(private readonly deps: ControllerDeps) {
    super()
  }

  private log(msg: string): void {
    this.emit('activity', msg)
  }

  async listDevices(): Promise<Device[]> {
    const adb = this.deps.adb()
    if (!adb) throw new Error('adb not found on this Mac (brew install android-platform-tools)')
    return (await adb.devices()).devices
  }

  /** `device` may be a hardware serial, a transport serial or a model name; optional if one phone. */
  private async target(device?: string): Promise<Target> {
    const adb = this.deps.adb()
    if (!adb) throw new Error('adb not found on this Mac (brew install android-platform-tools)')
    const devices = (await adb.devices()).devices
    if (!devices.length) throw new Error('No phone connected. Connect one by USB or Wi-Fi in Mob Mirror.')
    let d: Device | undefined
    if (device) {
      const q = device.toLowerCase()
      d = devices.find(
        (x) => x.id.toLowerCase() === q || x.model.toLowerCase() === q || x.transports.some((t) => t.serial.toLowerCase() === q),
      )
      if (!d) throw new Error(`No phone matches "${device}". Call list_devices.`)
    } else {
      const mirrored = devices.find((x) => this.deps.findSession(x.transports.map((s) => s.serial)))
      d = mirrored ?? (devices.length === 1 ? devices[0] : undefined)
      if (!d) throw new Error('Several phones are connected: pass `device` (see list_devices).')
    }
    const live = this.deps.findSession(d.transports.map((s) => s.serial))
    return {
      adb,
      device: d,
      serial: live?.session.serial ?? d.transports[0]!.serial,
      session: live?.session ?? null,
      capture: live?.capture ?? null,
    }
  }

  /** Screen size in device pixels, current orientation. */
  private async screen(t: Target): Promise<Size> {
    const known = this.screens.get(t.device.id)
    const video = t.session?.videoSize
    if (known && video) {
      // Orientation may have flipped since the last screencap: follow the live video's aspect.
      const landscape = video.width > video.height
      const knownLandscape = known.width > known.height
      return landscape === knownLandscape ? known : { width: known.height, height: known.width }
    }
    if (known) return known
    const out = await t.adb.runLoose(['shell', 'wm', 'size'], t.serial)
    const m = /(?:Override|Physical) size: (\d+)x(\d+)/.exec(out)
    if (!m) throw new Error('could not read the screen size')
    let s = { width: Number(m[1]), height: Number(m[2]) }
    if (video && video.width > video.height !== s.width > s.height) s = { width: s.height, height: s.width }
    this.screens.set(t.device.id, s)
    return s
  }

  private async space(t: Target): Promise<Size> {
    return agentSpace(await this.screen(t))
  }

  // ---- observation ----

  async screenshot(device?: string): Promise<Screenshot> {
    const t = await this.target(device)
    let png: Uint8Array | null = null
    let source: Screenshot['source'] = 'mirror'
    if (t.capture) png = await t.capture().catch(() => null)
    if (!png) {
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
    const space = agentSpace(source === 'screencap' ? img.getSize() : await this.screen(t))
    img = img.resize({ width: space.width, height: space.height, quality: 'good' })
    this.log('took a screenshot')
    return { data: img.toJPEG(82).toString('base64'), mimeType: 'image/jpeg', ...space, source }
  }

  async uiTree(device?: string): Promise<{ nodes: UiNode[]; space: Size }> {
    const t = await this.target(device)
    const path = '/data/local/tmp/mob-mirror-ui.xml'
    const out = await t.adb.runLoose(['shell', 'uiautomator', 'dump', path], t.serial, 15000)
    if (!/dumped to/i.test(out)) {
      throw new Error(
        `uiautomator could not dump the screen (${out.trim() || 'timeout'}). This happens while the screen is animating; use screenshot instead or retry.`,
      )
    }
    const xml = await t.adb.runLoose(['shell', 'cat', path], t.serial)
    void t.adb.runLoose(['shell', 'rm', '-f', path], t.serial)
    const screen = await this.screen(t)
    const space = agentSpace(screen)
    this.log('read the screen’s UI tree')
    return { nodes: parseUiDump(xml, screen, space), space }
  }

  async info(device?: string): Promise<Record<string, unknown>> {
    const t = await this.target(device)
    const sh = (cmd: string): Promise<string> => t.adb.runLoose(['shell', cmd], t.serial).then((s) => s.trim())
    const [release, battery, top] = await Promise.all([
      sh('getprop ro.build.version.release'),
      sh('dumpsys battery | grep -m1 level'),
      sh('dumpsys activity activities | grep -m1 topResumedActivity'),
    ])
    const screen = await this.screen(t)
    return {
      model: t.device.model,
      id: t.device.id,
      android: release,
      sdk: t.device.sdk,
      screen,
      agentSpace: agentSpace(screen),
      battery: /level: (\d+)/.exec(battery)?.[1] ?? null,
      foregroundApp: /u0 ([\w.]+)\//.exec(top)?.[1] ?? null,
      controlPath: t.session ? 'mirror session (scrcpy)' : 'adb input (no mirror open)',
      transports: t.device.transports.map((x) => `${x.kind}:${x.serial}`),
    }
  }

  async listApps(filter?: string, device?: string): Promise<string[]> {
    const t = await this.target(device)
    const out = await t.adb.runLoose(['shell', 'pm', 'list', 'packages', '-3'], t.serial)
    const all = out
      .split('\n')
      .map((l) => l.replace(/^package:/, '').trim())
      .filter(Boolean)
      .sort()
    return filter ? all.filter((p) => p.toLowerCase().includes(filter.toLowerCase())) : all
  }

  // ---- input ----

  private async toDevice(t: Target, p: Point): Promise<Point> {
    const space = await this.space(t)
    const err = checkPoint(p, space)
    if (err) throw new Error(err)
    return mapPoint(p, space, await this.screen(t))
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

  async tap(x: number, y: number, device?: string, holdMs = 60): Promise<string> {
    const t = await this.target(device)
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
    this.log(holdMs > 300 ? `long-pressed (${x}, ${y})` : `tapped (${x}, ${y})`)
    return `${holdMs > 300 ? 'Long-pressed' : 'Tapped'} (${x}, ${y})`
  }

  async swipe(from: Point, to: Point, durationMs = 300, device?: string): Promise<string> {
    const t = await this.target(device)
    const ms = Math.min(Math.max(durationMs, 50), 5000)
    if (t.session?.videoSize) {
      const a = await this.toVideo(t, from)
      const b = await this.toVideo(t, to)
      const steps = Math.max(6, Math.round(ms / 16))
      this.finger(t, MotionAction.DOWN, a.point, a.size)
      for (let i = 1; i <= steps; i++) {
        await sleep(ms / steps)
        const f = i / steps
        this.finger(
          t,
          MotionAction.MOVE,
          { x: Math.round(a.point.x + (b.point.x - a.point.x) * f), y: Math.round(a.point.y + (b.point.y - a.point.y) * f) },
          a.size,
        )
      }
      this.finger(t, MotionAction.UP, b.point, a.size)
    } else {
      const a = await this.toDevice(t, from)
      const b = await this.toDevice(t, to)
      await t.adb.runLoose(['shell', 'input', 'swipe', `${a.x}`, `${a.y}`, `${b.x}`, `${b.y}`, `${ms}`], t.serial)
    }
    this.log(`swiped (${from.x}, ${from.y}) → (${to.x}, ${to.y})`)
    return `Swiped (${from.x}, ${from.y}) → (${to.x}, ${to.y}) in ${ms} ms`
  }

  /** Scrolls the content by dragging in the middle of the screen. `amount` = fraction of the screen. */
  async scroll(direction: 'up' | 'down' | 'left' | 'right', amount = 0.5, device?: string): Promise<string> {
    const t = await this.target(device)
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
    await this.swipe(from, to, 350, device)
    return `Scrolled ${direction}`
  }

  async typeText(text: string, submit = false, device?: string): Promise<string> {
    const t = await this.target(device)
    const ascii = /^[\x20-\x7e]*$/.test(text)
    if (t.session) {
      if (ascii) {
        for (let i = 0; i < text.length; i += 250) t.session.sendControl(injectText(text.slice(i, i + 250)))
      } else {
        // Non-ASCII: put it on the phone clipboard and paste (scrcpy SET_CLIPBOARD with paste).
        t.session.sendControl(setClipboard(BigInt(Date.now()), text, true))
      }
      if (submit) {
        await sleep(80)
        this.key(t, AGENT_KEYS.enter)
      }
    } else {
      if (!ascii) throw new Error('Non-ASCII text needs an open mirror session (it is pasted via the clipboard).')
      await t.adb.runLoose(['shell', 'input', 'text', escapeInputText(text)], t.serial)
      if (submit) await t.adb.runLoose(['shell', 'input', 'keyevent', '66'], t.serial)
    }
    this.log(`typed ${text.length} character(s)`)
    return `Typed ${text.length} character(s)${submit ? ' and pressed Enter' : ''}`
  }

  private key(t: Target, code: number): void {
    t.session!.sendControl(injectKeycode(KeyAction.DOWN, code))
    t.session!.sendControl(injectKeycode(KeyAction.UP, code))
  }

  async pressKey(key: AgentKey, device?: string): Promise<string> {
    const t = await this.target(device)
    const code = AGENT_KEYS[key]
    if (t.session) this.key(t, code)
    else await t.adb.runLoose(['shell', 'input', 'keyevent', String(code)], t.serial)
    this.log(`pressed ${key}`)
    return `Pressed ${key}`
  }

  async launchApp(pkg: string, device?: string): Promise<string> {
    const t = await this.target(device)
    if (!/^[\w.]+$/.test(pkg)) throw new Error('package must look like com.example.app (see list_apps)')
    if (t.session) t.session.sendControl(startApp(pkg))
    else {
      const out = await t.adb.runLoose(['shell', 'monkey', '-p', pkg, '-c', 'android.intent.category.LAUNCHER', '1'], t.serial)
      if (/No activities found|monkey aborted/i.test(out)) throw new Error(`could not launch ${pkg}: ${out.trim()}`)
    }
    this.log(`opened ${pkg}`)
    return `Launched ${pkg}`
  }

  async unlock(device?: string): Promise<string> {
    const t = await this.target(device)
    if (!t.session) throw new Error('Unlocking needs an open mirror session for this phone in Mob Mirror.')
    this.log('asked to unlock: waiting for Touch ID on the Mac')
    const r = await this.deps.unlock(t.adb, t.session)
    if (!r.ok) throw new Error(r.message)
    return r.message
  }
}
