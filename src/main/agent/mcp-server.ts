// Local MCP server so coding agents (Claude Code, Cursor, VS Code…) can see and control the phone.
//
// Security model:
//  - Off by default; the user enables "Agent access" in the app.
//  - Listens on 127.0.0.1 only; Host/Origin validation blocks DNS-rebinding from web pages.
//  - Every request needs `Authorization: Bearer <token>` (random 256-bit, compared in constant time).
//  - Unlocking is only possible with a PIN the user saved, and only after Touch ID on the Mac.
//  - Every action is shown in the app ("Agent: tapped …") so the user can see what happens.
// API verified against @modelcontextprotocol/server 2.4.0 / node 2.1.2 (docs/FACTS.md).
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { join } from 'node:path'
import { app } from 'electron'
import { localhostHostValidation, localhostOriginValidation, toNodeHandler } from '@modelcontextprotocol/node'
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server'
import * as z from 'zod'
import { setAgentMaxDim } from './geometry'
import { AGENT_KEYS, describeQuery, type AgentKey, type AgentOptions, type DeviceController, type ScreenChoice } from './controller'

export const DEFAULT_PORT = 38297

export interface AgentSettings {
  enabled: boolean
  port: number
  token: string
  /** Where agents act by default: their own second screen, or the phone's screen. */
  workspace: ScreenChoice
  /** The `shell` tool. Off by default. */
  allowShell: boolean
  /** clear_app_data, uninstall_app, set_permission. */
  allowAppChanges: boolean
  /** set_device_state (dark mode, network, battery…: changes the whole phone). */
  allowDeviceSettings: boolean
  /** push / pull / list files, install_apk. */
  allowFiles: boolean
  /** Close the agent screen after this many idle minutes (0 = keep it open). */
  idleCloseMin: number
  /** Agent screen size: phone-shaped 1080×2400, a tablet, or the phone's own resolution. */
  screenSize: AgentScreenSize
  /** Advanced: screenshot long side (px) and JPEG quality (%). */
  screenshotMaxDim: number
  jpegQuality: number
}

export type AgentScreenSize = 'phone' | 'tablet' | 'match'

export interface AgentStatus {
  enabled: boolean
  running: boolean
  port: number
  url: string
  workspace: ScreenChoice
  allowShell: boolean
  allowAppChanges: boolean
  allowDeviceSettings: boolean
  allowFiles: boolean
  idleCloseMin: number
  screenSize: AgentScreenSize
  screenshotMaxDim: number
  jpegQuality: number
  error?: string
}

const settingsPath = (): string => join(app.getPath('userData'), 'agent.json')

export function loadAgentSettings(): AgentSettings {
  let s: Partial<AgentSettings> = {}
  try {
    if (existsSync(settingsPath())) s = JSON.parse(readFileSync(settingsPath(), 'utf8')) as Partial<AgentSettings>
  } catch {
    // corrupt file: start fresh
  }
  const settings: AgentSettings = {
    enabled: s.enabled === true,
    port: Number.isInteger(s.port) && s.port! > 1024 && s.port! < 65536 ? s.port! : DEFAULT_PORT,
    token: typeof s.token === 'string' && /^[a-f0-9]{64}$/.test(s.token) ? s.token : randomBytes(32).toString('hex'),
    workspace: s.workspace === 'phone' ? 'phone' : 'agent',
    allowShell: s.allowShell === true,
    allowAppChanges: s.allowAppChanges !== false,
    allowDeviceSettings: s.allowDeviceSettings !== false,
    allowFiles: s.allowFiles !== false,
    idleCloseMin: [0, 5, 15, 30].includes(s.idleCloseMin as number) ? (s.idleCloseMin as number) : 15,
    screenSize: s.screenSize === 'tablet' || s.screenSize === 'match' ? s.screenSize : 'phone',
    screenshotMaxDim: [1024, 1280, 1600].includes(s.screenshotMaxDim as number) ? (s.screenshotMaxDim as number) : 1280,
    jpegQuality: [70, 82, 92].includes(s.jpegQuality as number) ? (s.jpegQuality as number) : 82,
  }
  setAgentMaxDim(settings.screenshotMaxDim)
  saveAgentSettings(settings)
  return settings
}

export function saveAgentSettings(s: AgentSettings): void {
  writeFileSync(settingsPath(), JSON.stringify(s), { mode: 0o600 })
}

const text = (t: string): { content: { type: 'text'; text: string }[] } => ({ content: [{ type: 'text', text: t }] })
const deviceArg = z
  .string()
  .optional()
  .describe('Phone to control (id, serial or model from list_devices). Optional when one phone is connected or mirrored.')
const screenArg = z
  .enum(['agent', 'phone'])
  .optional()
  .describe(
    'Where to act. "agent" (default): your own second screen of the phone, so the user can keep using the phone; it opens by itself. "phone": the phone’s own screen (what the user sees). Use "phone" only when the task needs it (e.g. the lock screen or something the user has open).',
  )
const coord = z.number().describe('In screenshot pixels (top-left is 0,0)')
const elementArgs = {
  text: z.string().optional().describe('Visible text, content description or hint (substring, case-insensitive)'),
  id: z.string().optional().describe('Resource id, e.g. "send" or "com.whatsapp:id/send"'),
  ref: z.string().optional().describe('Element ref from get_ui_tree / find_elements'),
  exact: z.boolean().optional().describe('Text must match exactly'),
  index: z.number().int().min(0).optional().describe('Which match when several (0 = first)'),
}

const INSTRUCTIONS = `Twinglass lets you see and control the user's Android phone.
- By default you act on YOUR OWN second screen of the phone (screen "agent"): a separate virtual display, so the user can keep using their phone while you work. Twinglass shows it in a window on the Mac so they can watch. Apps you open there run there; close it with agent_screen {action:"close"} when done.
- Prefer element tools over coordinates: get_ui_tree / find_elements, then tap_element / set_text, and wait_for instead of fixed waits. They need "Agents read any screen" (Twinglass → Settings → Agents); without it the agent screen only offers screenshot + coordinates.
- Loop: observe (screenshot or get_ui_tree) → act → verify. Use run_steps for a known sequence.
- Building or checking UI: screen_map gives exact dp positions, sizes, insets, gaps, text sizes (sp) and colours, plus an annotated image. Use it instead of estimating from screenshots.
- Testing an app: install_apk, app_info, start_activity (deep links, extras, cold-start time), clear_app_data, set_permission, get_crashes, logcat, app_performance (jank, memory, CPU), set_device_state (dark mode, font size, animations off, network, battery; finish with reset), reverse_port (reach a dev server on the Mac), record_screen.
- Secure screens (PIN entry, banking apps) come back black. unlock_phone needs the user's Touch ID.`

function buildServer(ctl: DeviceController): McpServer {
  const s = new McpServer({ name: 'mob-mirror', version: app.getVersion() }, { instructions: INSTRUCTIONS })

  s.registerTool(
    'list_devices',
    { description: 'List Android phones connected to Twinglass (USB or Wi-Fi), with model, Android SDK and transports.', inputSchema: z.object({}) },
    async () => text(JSON.stringify(await ctl.listDevices(), null, 1)),
  )

  s.registerTool(
    'device_info',
    {
      description:
        'Model, Android version, battery, whether the phone is locked, the app in front and the apps open on the chosen screen, screen size and the coordinate space used by tap/swipe.',
      inputSchema: z.object({ device: deviceArg, screen: screenArg }),
    },
    async ({ device, screen }) => text(JSON.stringify(await ctl.info(device, screen), null, 1)),
  )

  s.registerTool(
    'phone_details',
    {
      description: 'Everything about the phone: device and SoC, Android build and API level, CPU, memory, storage, display, battery, cameras, sensors, codecs, network, features.',
      inputSchema: z.object({ device: deviceArg }),
    },
    async ({ device }) => text(await ctl.details(device)),
  )

  s.registerTool(
    'agent_screen',
    {
      description:
        'Your own second screen of the phone. "open" starts it (also happens by itself on the first action), "status" lists the apps open there, "close" ends it (its apps move to the phone in the background).',
      inputSchema: z.object({ action: z.enum(['open', 'status', 'close']), device: deviceArg }),
    },
    async ({ action, device }) => text(await ctl.agentScreen(action, device)),
  )

  s.registerTool(
    'screenshot',
    {
      description:
        'Capture the screen as an image. All tap/swipe coordinates are in THIS image’s pixel space. Take a new screenshot after each action to see the result. Secure screens (PIN entry, banking apps) are black.',
      inputSchema: z.object({ device: deviceArg, screen: screenArg }),
    },
    async ({ device, screen }) => {
      const shot = await ctl.screenshot(device, screen)
      return {
        content: [
          { type: 'image', data: shot.data, mimeType: shot.mimeType },
          { type: 'text', text: `Screenshot of the ${shot.screen} screen, ${shot.width}×${shot.height} px (source: ${shot.source}). Use these pixel coordinates for tap/swipe.` },
        ],
      }
    },
  )

  s.registerTool(
    'get_ui_tree',
    {
      description:
        'List on-screen elements (label, id, type, flags like editable/checked, ref) with centre coordinates in screenshot space. Press one with tap_element {ref} or tap its `center`.',
      inputSchema: z.object({ device: deviceArg, screen: screenArg, only_interactive: z.boolean().optional().describe('Only clickable / editable / scrollable elements') }),
    },
    async ({ device, screen, only_interactive }) => {
      const r = await ctl.uiTree(device, screen)
      const nodes = only_interactive ? r.nodes.filter((n) => n.clickable || n.flags?.match(/editable|scrollable/)) : r.nodes
      return text(JSON.stringify({ screen: r.screen, via: r.via, space: r.space, count: nodes.length, nodes }))
    },
  )

  s.registerTool(
    'find_elements',
    {
      description: 'Find elements by text, id or ref; returns matches with centre coordinates and refs. Cheaper than reading the whole tree.',
      inputSchema: z.object({ ...elementArgs, device: deviceArg, screen: screenArg }),
    },
    async ({ device, screen, ...q }) => {
      const hits = await ctl.findElements(q, device, screen)
      return text(hits.length ? JSON.stringify(hits.slice(0, 30)) : `No element matches ${describeQuery(q)}.`)
    },
  )

  s.registerTool(
    'tap_element',
    {
      description:
        'Press an element found by text, id or ref (no coordinates needed). Uses the accessibility action when available, so it works even if the layout shifts; else taps its centre.',
      inputSchema: z.object({ ...elementArgs, long: z.boolean().optional().describe('Long-press instead'), device: deviceArg, screen: screenArg }),
    },
    async ({ device, screen, long, ...q }) => text(await ctl.tapElement(q, long ?? false, device, screen)),
  )

  s.registerTool(
    'set_text',
    {
      description:
        'Replace the text of a field (any language, emoji included; no keyboard needed). Picks the field by text/hint/id/ref, else the focused field. submit presses Enter afterwards.',
      inputSchema: z.object({ value: z.string().max(5000), ...elementArgs, submit: z.boolean().optional(), device: deviceArg, screen: screenArg }),
    },
    async ({ value, submit, device, screen, ...q }) => text(await ctl.setText(value, q, submit ?? false, device, screen)),
  )

  s.registerTool(
    'wait_for',
    {
      description: 'Wait until an element (by text/id) appears, or with gone=true disappears. Better than fixed waits after navigation or loading.',
      inputSchema: z.object({
        ...elementArgs,
        gone: z.boolean().optional(),
        timeout_ms: z.number().min(200).max(30000).optional().describe('Default 8000'),
        device: deviceArg,
        screen: screenArg,
      }),
    },
    async ({ gone, timeout_ms, device, screen, ...q }) => text(await ctl.waitFor(q, gone ?? false, timeout_ms ?? 8000, device, screen)),
  )

  s.registerTool(
    'tap',
    { description: 'Tap the screen at (x, y) in screenshot coordinates.', inputSchema: z.object({ x: coord, y: coord, device: deviceArg, screen: screenArg }) },
    async ({ x, y, device, screen }) => text(await ctl.tap(x, y, device, 60, screen)),
  )

  s.registerTool(
    'long_press',
    {
      description: 'Press and hold at (x, y) in screenshot coordinates (context menus, drag handles, text selection).',
      inputSchema: z.object({ x: coord, y: coord, duration_ms: z.number().min(300).max(5000).optional(), device: deviceArg, screen: screenArg }),
    },
    async ({ x, y, duration_ms, device, screen }) => text(await ctl.tap(x, y, device, duration_ms ?? 700, screen)),
  )

  s.registerTool(
    'swipe',
    {
      description: 'Drag one finger from (x1, y1) to (x2, y2) in screenshot coordinates.',
      inputSchema: z.object({
        x1: coord,
        y1: coord,
        x2: coord,
        y2: coord,
        duration_ms: z.number().min(50).max(5000).optional().describe('Default 300'),
        device: deviceArg,
        screen: screenArg,
      }),
    },
    async ({ x1, y1, x2, y2, duration_ms, device, screen }) => text(await ctl.swipe({ x: x1, y: y1 }, { x: x2, y: y2 }, duration_ms ?? 300, device, screen)),
  )

  s.registerTool(
    'scroll',
    {
      description: 'Scroll the content in the middle of the screen. "down" reveals what is below.',
      inputSchema: z.object({
        direction: z.enum(['up', 'down', 'left', 'right']),
        amount: z.number().min(0.1).max(0.9).optional().describe('Fraction of the screen, default 0.5'),
        device: deviceArg,
        screen: screenArg,
      }),
    },
    async ({ direction, amount, device, screen }) => text(await ctl.scroll(direction, amount ?? 0.5, device, screen)),
  )

  s.registerTool(
    'type_text',
    {
      description: 'Type into the focused field (tap it first). For replacing a field’s content prefer set_text. submit presses Enter afterwards.',
      inputSchema: z.object({ text: z.string().min(1).max(5000), submit: z.boolean().optional(), device: deviceArg, screen: screenArg }),
    },
    async ({ text: t, submit, device, screen }) => text(await ctl.typeText(t, submit ?? false, device, screen)),
  )

  s.registerTool(
    'press_key',
    {
      description: 'Press a hardware/navigation key: back, home, recents, enter, delete, tab, escape, volume_up/down, power, dpad_*, etc.',
      inputSchema: z.object({ key: z.enum(Object.keys(AGENT_KEYS) as [AgentKey, ...AgentKey[]]), device: deviceArg, screen: screenArg }),
    },
    async ({ key, device, screen }) => text(await ctl.pressKey(key, device, screen)),
  )

  s.registerTool(
    'list_apps',
    {
      description: 'Installed apps with their names and package names (system apps marked), optionally filtered by name or package.',
      inputSchema: z.object({ filter: z.string().optional(), device: deviceArg }),
    },
    async ({ filter, device }) => {
      const apps = await ctl.listApps(filter, device)
      return text(apps.map((a) => `${a.label} — ${a.pkg}${a.system ? ' (system)' : ''}`).join('\n') || '(none)')
    },
  )

  s.registerTool(
    'launch_app',
    {
      description: 'Open an app by package name or by its name ("WhatsApp"). On the agent screen it opens (or moves) there.',
      inputSchema: z.object({ package: z.string().describe('Package (com.whatsapp) or app name'), device: deviceArg, screen: screenArg }),
    },
    async ({ package: pkg, device, screen }) => text(await ctl.launchApp(pkg, device, screen)),
  )

  s.registerTool(
    'open_url',
    {
      description: 'Open a link in the phone’s default app for it: web pages, mailto:, tel:, geo: (maps), market:// (Play Store), deep links handled by apps.',
      inputSchema: z.object({ url: z.string(), device: deviceArg, screen: screenArg }),
    },
    async ({ url, device, screen }) => text(await ctl.openUrl(url, device, screen)),
  )

  s.registerTool(
    'stop_app',
    { description: 'Force-stop an app (to restart it cleanly while testing).', inputSchema: z.object({ package: z.string(), device: deviceArg }) },
    async ({ package: pkg, device }) => text(await ctl.stopApp(pkg, device)),
  )

  s.registerTool(
    'get_notifications',
    {
      description: 'The phone’s current notifications (app, title, text, time), newest first. Optionally only one app’s.',
      inputSchema: z.object({ package: z.string().optional(), include_ongoing: z.boolean().optional().describe('Also media players, downloads and other ongoing ones'), device: deviceArg }),
    },
    async ({ package: pkg, include_ongoing, device }) => {
      const list = (await ctl.notifications(pkg, device)).filter((n) => include_ongoing || !n.ongoing)
      return text(
        list.length
          ? list.map((n) => `[${n.app}]${n.when ? ` ${new Date(n.when).toLocaleString()}` : ''}\n${n.title}${n.text ? `\n${n.text}` : ''}`).join('\n\n')
          : 'No notifications.',
      )
    },
  )

  s.registerTool(
    'logcat',
    {
      description: 'Recent Android log lines, for debugging an app you are testing. Filter by package (its process), minimum level and/or a substring.',
      inputSchema: z.object({
        package: z.string().optional(),
        lines: z.number().int().min(10).max(2000).optional().describe('Default 200'),
        level: z.enum(['V', 'D', 'I', 'W', 'E']).optional(),
        grep: z.string().optional(),
        device: deviceArg,
      }),
    },
    async ({ package: pkg, lines, level, grep, device }) => text(await ctl.logcat({ pkg, lines, level, grep }, device)),
  )

  s.registerTool(
    'push_file',
    {
      description: 'Copy a file from this Mac to the phone (default /sdcard/Download; it shows up in Files and Gallery).',
      inputSchema: z.object({ mac_path: z.string().describe('Absolute path on the Mac'), phone_dir: z.string().optional(), device: deviceArg }),
    },
    async ({ mac_path, phone_dir, device }) => text(await ctl.pushFile(mac_path, phone_dir, device)),
  )

  s.registerTool(
    'pull_file',
    {
      description: 'Copy a file from the phone to the Mac (~/Downloads/Twinglass). Returns the Mac path.',
      inputSchema: z.object({ phone_path: z.string(), device: deviceArg }),
    },
    async ({ phone_path, device }) => text(await ctl.pullFile(phone_path, device)),
  )

  s.registerTool(
    'list_files',
    { description: 'List a folder on the phone, e.g. /sdcard/Download or /sdcard/DCIM/Camera.', inputSchema: z.object({ path: z.string(), device: deviceArg }) },
    async ({ path, device }) => text(await ctl.listFiles(path, device)),
  )

  s.registerTool(
    'install_apk',
    { description: 'Install (or update) an app from an .apk file on this Mac, e.g. a build you just made.', inputSchema: z.object({ apk_path: z.string(), device: deviceArg }) },
    async ({ apk_path, device }) => text(await ctl.installApk(apk_path, device)),
  )

  s.registerTool(
    'set_clipboard',
    { description: 'Put text on the phone’s clipboard (the user or you can paste it).', inputSchema: z.object({ text: z.string().max(100_000), device: deviceArg, screen: screenArg }) },
    async ({ text: t, device, screen }) => text(await ctl.setClipboard(t, device, screen)),
  )

  s.registerTool(
    'shell',
    {
      description: 'Run an adb shell command on the phone (am, pm, settings, dumpsys, cmd…). Only works when the user allowed it in Twinglass → Settings → Agents.',
      inputSchema: z.object({ command: z.string().min(1).max(4000), device: deviceArg }),
    },
    async ({ command, device }) => text(await ctl.shell(command, device)),
  )

  s.registerTool(
    'unlock_phone',
    {
      description:
        'Unlock the phone’s lock screen with the PIN the user saved in Twinglass. The user must approve with Touch ID on the Mac; the PIN is never exposed to the agent. Needs a mirror of the phone’s screen.',
      inputSchema: z.object({ device: deviceArg }),
    },
    async ({ device }) => text(await ctl.unlock(device)),
  )

  s.registerTool(
    'wait',
    {
      description: 'Wait a fixed time (max 10 s). Prefer wait_for when you know what should appear.',
      inputSchema: z.object({ ms: z.number().min(50).max(10000) }),
    },
    async ({ ms }) => {
      await new Promise((r) => setTimeout(r, ms))
      return text(`Waited ${ms} ms`)
    },
  )

  s.registerTool(
    'screen_map',
    {
      description:
        'Exact layout of the screen, for building or checking UI without guessing: every view with position and size in dp (and px), parent, insets from the parent, gap to the previous sibling, layout width/height (match_parent / wrap_content / dp), text size in sp, sampled background / text colours; the status / navigation bar and keyboard heights; and a design summary (type scale, spacing scale, keylines, repeated items, colour palette). With image=true (default) also returns the screen with every element boxed and labelled "n12 · 360×48" (dp), matching the JSON, plus an optional dp grid. Needs "Agents read any screen".',
      inputSchema: z.object({
        app: z.string().optional().describe('Only this app’s views (package). Default: the app windows, without system UI'),
        include_system: z.boolean().optional().describe('Also map the status bar, navigation bar and other system UI'),
        detail: z.enum(['compact', 'full']).optional().describe('compact (default) drops layout-only wrappers that add nothing; full keeps every view'),
        max_nodes: z.number().int().min(20).max(2000).optional().describe('Default 600'),
        image: z.boolean().optional().describe('Annotated screenshot (default true)'),
        grid_dp: z.number().min(2).max(64).optional().describe('Draw a grid every N dp on the image (e.g. 8)'),
        colors: z.boolean().optional().describe('Sample colours from the live frame (default true)'),
        device: deviceArg,
        screen: screenArg,
      }),
    },
    async ({ app: pkg, include_system, detail, max_nodes, image, grid_dp, colors, device, screen }) => {
      const r = await ctl.screenMap({ app: pkg, includeSystem: include_system, detail, maxNodes: max_nodes, image, gridDp: grid_dp, colors }, device, screen)
      const content: ({ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string })[] = [
        {
          type: 'text',
          text: `${JSON.stringify(r.map)}\n\nUnits: dp unless named (px = display pixels; density ${r.map.display.density} px per dp). "tap" is in screenshot coordinates for tap. "n…" numbers match the boxes in the image.`,
        },
      ]
      if (r.image) content.push({ type: 'image', data: r.image, mimeType: 'image/jpeg' })
      return { content }
    },
  )

  // ---- app testing ----
  const pkgArg = z.string().describe('Package name, e.g. com.example.app')

  s.registerTool(
    'app_info',
    {
      description: 'An installed app’s version, versionCode, min/target SDK, install and update times, installer, debuggable, granted / denied permissions, and whether it is running.',
      inputSchema: z.object({ package: pkgArg, device: deviceArg }),
    },
    async ({ package: pkg, device }) => text(JSON.stringify(await ctl.appInfo(pkg, device), null, 1)),
  )

  s.registerTool(
    'start_activity',
    {
      description:
        'Start an app or a specific activity with an intent: component, action, data URI (deep links) and extras. cold=true force-stops it first (cold-start test). Returns the launch time Android measured.',
      inputSchema: z.object({
        package: z.string().optional().describe('Launch this app’s main activity (when no component/action/data)'),
        component: z.string().optional().describe('com.app/.ui.DetailActivity'),
        action: z.string().optional().describe('e.g. android.intent.action.VIEW'),
        data: z.string().optional().describe('URI, e.g. myapp://item/42 or https://…'),
        extras: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
        cold: z.boolean().optional(),
        clear_task: z.boolean().optional().describe('Start in a fresh task (clears its back stack)'),
        device: deviceArg,
        screen: screenArg,
      }),
    },
    async ({ package: pkg, component, action, data, extras, cold, clear_task, device, screen }) =>
      text(await ctl.startActivity({ pkg, component, action, data, extras, cold, clearTask: clear_task }, device, screen)),
  )

  s.registerTool(
    'clear_app_data',
    {
      description: 'Wipe an app’s data and cache (like a fresh install: logged out, onboarding again). Destructive for that app.',
      inputSchema: z.object({ package: pkgArg, device: deviceArg }),
    },
    async ({ package: pkg, device }) => text(await ctl.clearData(pkg, device)),
  )

  s.registerTool(
    'uninstall_app',
    { description: 'Uninstall an app (keep_data keeps its data for a reinstall).', inputSchema: z.object({ package: pkgArg, keep_data: z.boolean().optional(), device: deviceArg }) },
    async ({ package: pkg, keep_data, device }) => text(await ctl.uninstall(pkg, keep_data ?? false, device)),
  )

  s.registerTool(
    'set_permission',
    {
      description: 'Grant or revoke a runtime permission of an app (CAMERA, ACCESS_FINE_LOCATION, POST_NOTIFICATIONS, RECORD_AUDIO…), or reset all so it asks again.',
      inputSchema: z.object({
        package: pkgArg,
        permission: z.string().optional().describe('e.g. CAMERA or android.permission.CAMERA'),
        grant: z.boolean().optional().describe('true = grant, false = revoke'),
        reset_all: z.boolean().optional(),
        device: deviceArg,
      }),
    },
    async ({ package: pkg, permission, grant, reset_all, device }) => {
      if (reset_all) return text(await ctl.resetPermissions(pkg, device))
      if (!permission || grant === undefined) throw new Error('Pass permission and grant, or reset_all.')
      return text(await ctl.permission(pkg, permission, grant, device))
    },
  )

  s.registerTool(
    'get_crashes',
    {
      description: 'Recent crashes from Android’s crash log (Java exceptions with stack traces, native crashes), optionally only one app’s.',
      inputSchema: z.object({ package: z.string().optional(), lines: z.number().int().min(20).max(3000).optional(), device: deviceArg }),
    },
    async ({ package: pkg, lines, device }) => text(await ctl.crashes(pkg, lines ?? 400, device)),
  )

  s.registerTool(
    'app_performance',
    {
      description:
        'How smooth and heavy an app is: frames rendered and janky %, frame-time percentiles, memory (PSS) and recent CPU. reset=true starts a fresh frame window: reset, interact (scroll…), then call again.',
      inputSchema: z.object({ package: pkgArg, reset: z.boolean().optional(), device: deviceArg }),
    },
    async ({ package: pkg, reset, device }) => text(await ctl.performance(pkg, reset ?? false, device)),
  )

  s.registerTool(
    'set_device_state',
    {
      description:
        'Test under different conditions: dark mode, font scale, animations off (steadier UI tests), screen density, Wi-Fi / mobile data / airplane mode, a fake battery level or charging state. These change the WHOLE phone (also for the user): always finish with reset=true, which restores everything changed.',
      inputSchema: z.object({
        dark_mode: z.boolean().optional(),
        font_scale: z.number().min(0.85).max(2).optional(),
        animations: z.boolean().optional(),
        density: z.number().min(120).max(800).nullable().optional().describe('dpi; null resets'),
        wifi: z.boolean().optional(),
        mobile_data: z.boolean().optional(),
        airplane: z.boolean().optional(),
        battery_level: z.number().min(0).max(100).optional(),
        charging: z.boolean().optional(),
        reset: z.boolean().optional(),
        device: deviceArg,
      }),
    },
    async ({ device, ...o }) => text(await ctl.setDeviceState(o, device)),
  )

  s.registerTool(
    'reverse_port',
    {
      description: 'Let the app on the phone reach a server on this Mac: the phone’s localhost:<phone_port> goes to the Mac’s localhost:<mac_port> (dev servers, mock APIs, Metro). Also list / remove.',
      inputSchema: z.object({
        action: z.enum(['add', 'remove', 'list']),
        phone_port: z.number().int().optional(),
        mac_port: z.number().int().optional().describe('Default: same as phone_port'),
        device: deviceArg,
      }),
    },
    async ({ action, phone_port, mac_port, device }) => text(await ctl.reversePort(action, phone_port, mac_port, device)),
  )

  s.registerTool(
    'record_screen',
    {
      description: 'Record a video of the screen (bug reports, demos). start, then stop: returns the saved file (~/Movies/Twinglass).',
      inputSchema: z.object({ action: z.enum(['start', 'stop']), device: deviceArg, screen: screenArg }),
    },
    async ({ action, device, screen }) => text(await ctl.record(action === 'start', device, screen)),
  )

  // Several actions in one call: fewer round trips for a known sequence. Stops at the first error.
  const step = z.discriminatedUnion('action', [
    z.object({ action: z.literal('tap'), x: coord, y: coord }),
    z.object({ action: z.literal('long_press'), x: coord, y: coord, duration_ms: z.number().min(300).max(5000).optional() }),
    z.object({ action: z.literal('swipe'), x1: coord, y1: coord, x2: coord, y2: coord, duration_ms: z.number().min(50).max(5000).optional() }),
    z.object({ action: z.literal('scroll'), direction: z.enum(['up', 'down', 'left', 'right']), amount: z.number().min(0.1).max(0.9).optional() }),
    z.object({ action: z.literal('tap_element'), ...elementArgs, long: z.boolean().optional() }),
    z.object({ action: z.literal('set_text'), value: z.string().max(5000), ...elementArgs, submit: z.boolean().optional() }),
    z.object({ action: z.literal('type_text'), text: z.string().min(1).max(5000), submit: z.boolean().optional() }),
    z.object({ action: z.literal('press_key'), key: z.enum(Object.keys(AGENT_KEYS) as [AgentKey, ...AgentKey[]]) }),
    z.object({ action: z.literal('launch_app'), package: z.string() }),
    z.object({ action: z.literal('open_url'), url: z.string() }),
    z.object({ action: z.literal('wait'), ms: z.number().min(50).max(10000) }),
    z.object({ action: z.literal('wait_for'), ...elementArgs, gone: z.boolean().optional(), timeout_ms: z.number().min(200).max(30000).optional() }),
  ])
  s.registerTool(
    'run_steps',
    {
      description:
        'Run several actions in order in one call (tap, long_press, swipe, scroll, tap_element, set_text, type_text, press_key, launch_app, open_url, wait, wait_for). Stops at the first failure. screenshot_after returns a screenshot at the end.',
      inputSchema: z.object({ steps: z.array(step).min(1).max(50), screenshot_after: z.boolean().optional(), device: deviceArg, screen: screenArg }),
    },
    async ({ steps, screenshot_after, device, screen }) => {
      const log: string[] = []
      let failed = false
      for (const [i, st] of steps.entries()) {
        try {
          const r = await (async (): Promise<string> => {
            switch (st.action) {
              case 'tap':
                return ctl.tap(st.x, st.y, device, 60, screen)
              case 'long_press':
                return ctl.tap(st.x, st.y, device, st.duration_ms ?? 700, screen)
              case 'swipe':
                return ctl.swipe({ x: st.x1, y: st.y1 }, { x: st.x2, y: st.y2 }, st.duration_ms ?? 300, device, screen)
              case 'scroll':
                return ctl.scroll(st.direction, st.amount ?? 0.5, device, screen)
              case 'tap_element': {
                const { action: _a, long, ...q } = st
                return ctl.tapElement(q, long ?? false, device, screen)
              }
              case 'set_text': {
                const { action: _a, value, submit, ...q } = st
                return ctl.setText(value, q, submit ?? false, device, screen)
              }
              case 'type_text':
                return ctl.typeText(st.text, st.submit ?? false, device, screen)
              case 'press_key':
                return ctl.pressKey(st.key, device, screen)
              case 'launch_app':
                return ctl.launchApp(st.package, device, screen)
              case 'open_url':
                return ctl.openUrl(st.url, device, screen)
              case 'wait':
                await new Promise((r) => setTimeout(r, st.ms))
                return `Waited ${st.ms} ms`
              case 'wait_for': {
                const { action: _a, gone, timeout_ms, ...q } = st
                return ctl.waitFor(q, gone ?? false, timeout_ms ?? 8000, device, screen)
              }
            }
          })()
          log.push(`${i + 1}. ${r}`)
        } catch (e) {
          log.push(`${i + 1}. FAILED (${st.action}): ${e instanceof Error ? e.message : String(e)}`)
          failed = true
          break
        }
      }
      if (!failed && steps.length) log.push(`All ${steps.length} steps done.`)
      const content: ({ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string })[] = [{ type: 'text', text: log.join('\n') }]
      if (screenshot_after) {
        const shot = await ctl.screenshot(device, screen).catch(() => null)
        if (shot) content.push({ type: 'image', data: shot.data, mimeType: shot.mimeType })
      }
      return { content, ...(failed ? { isError: true } : {}) }
    },
  )

  return s
}

export class AgentServer {
  private server: Server | null = null
  private error: string | undefined

  constructor(
    private readonly ctl: DeviceController,
    private settings: AgentSettings,
  ) {}

  status(): AgentStatus {
    return {
      enabled: this.settings.enabled,
      running: this.server?.listening === true,
      port: this.settings.port,
      url: `http://127.0.0.1:${this.settings.port}/mcp`,
      ...this.options(),
      ...(this.error ? { error: this.error } : {}),
    }
  }

  /** `claude mcp add` command with the token (only ever handed to the user's clipboard). */
  setupCommand(): string {
    return `claude mcp add --transport http --scope user mob-mirror ${this.status().url} --header "Authorization: Bearer ${this.settings.token}"`
  }

  options(): AgentOptions {
    const { workspace, allowShell, allowAppChanges, allowDeviceSettings, allowFiles, idleCloseMin, screenSize, screenshotMaxDim, jpegQuality } = this.settings
    return { workspace, allowShell, allowAppChanges, allowDeviceSettings, allowFiles, idleCloseMin, screenSize, screenshotMaxDim, jpegQuality }
  }

  setOptions(o: Record<string, unknown>): AgentStatus {
    const bool = (k: 'allowShell' | 'allowAppChanges' | 'allowDeviceSettings' | 'allowFiles'): Partial<AgentSettings> =>
      typeof o[k] === 'boolean' ? { [k]: o[k] } : {}
    this.settings = {
      ...this.settings,
      ...(o.workspace === 'agent' || o.workspace === 'phone' ? { workspace: o.workspace } : {}),
      ...bool('allowShell'),
      ...bool('allowAppChanges'),
      ...bool('allowDeviceSettings'),
      ...bool('allowFiles'),
      ...([0, 5, 15, 30].includes(o.idleCloseMin as number) ? { idleCloseMin: o.idleCloseMin as number } : {}),
      ...(o.screenSize === 'phone' || o.screenSize === 'tablet' || o.screenSize === 'match' ? { screenSize: o.screenSize } : {}),
      ...([1024, 1280, 1600].includes(o.screenshotMaxDim as number) ? { screenshotMaxDim: o.screenshotMaxDim as number } : {}),
      ...([70, 82, 92].includes(o.jpegQuality as number) ? { jpegQuality: o.jpegQuality as number } : {}),
    }
    setAgentMaxDim(this.settings.screenshotMaxDim)
    saveAgentSettings(this.settings)
    return this.status()
  }

  /** Advanced: a different port (the old setup command stops working; copy it again). */
  async setPort(port: number): Promise<AgentStatus> {
    if (!Number.isInteger(port) || port < 1025 || port > 65535) throw new Error('Pick a port between 1025 and 65535.')
    const wasRunning = !!this.server
    this.settings = { ...this.settings, port }
    saveAgentSettings(this.settings)
    if (wasRunning) {
      await this.stop()
      await this.start()
    }
    return this.status()
  }

  regenerateToken(): void {
    this.settings = { ...this.settings, token: randomBytes(32).toString('hex') }
    saveAgentSettings(this.settings)
  }

  async setEnabled(enabled: boolean): Promise<AgentStatus> {
    this.settings = { ...this.settings, enabled }
    saveAgentSettings(this.settings)
    if (enabled) await this.start()
    else await this.stop()
    return this.status()
  }

  async start(): Promise<void> {
    if (this.server) return
    this.error = undefined
    const mcp = toNodeHandler(createMcpHandler(() => buildServer(this.ctl)))
    const vHost = localhostHostValidation()
    const vOrigin = localhostOriginValidation()
    const authed = (h: string | undefined): boolean => {
      const expected = Buffer.from(`Bearer ${this.settings.token}`)
      const got = Buffer.from(h ?? '')
      return got.length === expected.length && timingSafeEqual(got, expected)
    }
    const server = createServer((req, res) => {
      void (async () => {
        if (!vHost(req, res) || !vOrigin(req, res)) return // these reply 403 themselves
        if (new URL(req.url ?? '/', 'http://localhost').pathname !== '/mcp') return void res.writeHead(404).end()
        if (!authed(req.headers.authorization)) return void res.writeHead(401, { 'WWW-Authenticate': 'Bearer' }).end()
        try {
          await mcp(req, res)
        } catch (e) {
          console.error('[mcp]', e)
          if (!res.headersSent) res.writeHead(500).end()
        }
      })()
    })
    await new Promise<void>((resolve) => {
      server.once('error', (e: NodeJS.ErrnoException) => {
        this.error = e.code === 'EADDRINUSE' ? `Port ${this.settings.port} is already in use` : e.message
        this.server = null
        resolve()
      })
      server.listen(this.settings.port, '127.0.0.1', () => {
        this.server = server
        resolve()
      })
    })
  }

  async stop(): Promise<void> {
    const s = this.server
    this.server = null
    if (!s) return
    const closed = new Promise<void>((r) => s.close(() => r()))
    s.closeAllConnections() // MCP clients keep connections alive; don't wait for them
    await closed
  }
}
