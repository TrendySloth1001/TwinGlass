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
import { AGENT_KEYS, type AgentKey, type DeviceController } from './controller'

export const DEFAULT_PORT = 38297

export interface AgentSettings {
  enabled: boolean
  port: number
  token: string
}

export interface AgentStatus {
  enabled: boolean
  running: boolean
  port: number
  url: string
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
  }
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
const coord = z.number().describe('In screenshot pixels (top-left is 0,0)')

function buildServer(ctl: DeviceController): McpServer {
  const s = new McpServer({ name: 'mob-mirror', version: app.getVersion() })

  s.registerTool(
    'list_devices',
    { description: 'List Android phones connected to Twinglass (USB or Wi-Fi), with model, Android SDK and transports.', inputSchema: z.object({}) },
    async () => text(JSON.stringify(await ctl.listDevices(), null, 1)),
  )

  s.registerTool(
    'device_info',
    {
      description: 'Model, Android version, battery, foreground app, screen size and the coordinate space used by tap/swipe.',
      inputSchema: z.object({ device: deviceArg }),
    },
    async ({ device }) => text(JSON.stringify(await ctl.info(device), null, 1)),
  )

  s.registerTool(
    'screenshot',
    {
      description:
        'Capture the phone screen as an image. All tap/swipe coordinates are in THIS image’s pixel space. Take a new screenshot after each action to see the result. Secure screens (PIN entry, banking apps) are black.',
      inputSchema: z.object({ device: deviceArg }),
    },
    async ({ device }) => {
      const shot = await ctl.screenshot(device)
      return {
        content: [
          { type: 'image', data: shot.data, mimeType: shot.mimeType },
          { type: 'text', text: `Screenshot ${shot.width}×${shot.height} px (source: ${shot.source}). Use these pixel coordinates for tap/swipe.` },
        ],
      }
    },
  )

  s.registerTool(
    'get_ui_tree',
    {
      description:
        'List on-screen elements (text, content description, resource id, type, clickable) with centre coordinates in screenshot space. Tap an element’s `center` to press it. May fail while the screen animates; fall back to screenshot.',
      inputSchema: z.object({ device: deviceArg }),
    },
    async ({ device }) => {
      const { nodes, space } = await ctl.uiTree(device)
      return text(JSON.stringify({ space, count: nodes.length, nodes }))
    },
  )

  s.registerTool(
    'tap',
    { description: 'Tap the screen at (x, y) in screenshot coordinates.', inputSchema: z.object({ x: coord, y: coord, device: deviceArg }) },
    async ({ x, y, device }) => text(await ctl.tap(x, y, device)),
  )

  s.registerTool(
    'long_press',
    {
      description: 'Press and hold at (x, y) in screenshot coordinates (context menus, drag handles, text selection).',
      inputSchema: z.object({ x: coord, y: coord, duration_ms: z.number().min(300).max(5000).optional(), device: deviceArg }),
    },
    async ({ x, y, duration_ms, device }) => text(await ctl.tap(x, y, device, duration_ms ?? 700)),
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
      }),
    },
    async ({ x1, y1, x2, y2, duration_ms, device }) => text(await ctl.swipe({ x: x1, y: y1 }, { x: x2, y: y2 }, duration_ms ?? 300, device)),
  )

  s.registerTool(
    'scroll',
    {
      description: 'Scroll the content in the middle of the screen. "down" reveals what is below.',
      inputSchema: z.object({
        direction: z.enum(['up', 'down', 'left', 'right']),
        amount: z.number().min(0.1).max(0.9).optional().describe('Fraction of the screen, default 0.5'),
        device: deviceArg,
      }),
    },
    async ({ direction, amount, device }) => text(await ctl.scroll(direction, amount ?? 0.5, device)),
  )

  s.registerTool(
    'type_text',
    {
      description: 'Type text into the focused field (tap the field first). Set submit to press Enter afterwards.',
      inputSchema: z.object({ text: z.string().min(1).max(5000), submit: z.boolean().optional(), device: deviceArg }),
    },
    async ({ text: t, submit, device }) => text(await ctl.typeText(t, submit ?? false, device)),
  )

  s.registerTool(
    'press_key',
    {
      description: 'Press a hardware/navigation key: back, home, recents, enter, delete, tab, escape, volume_up/down, power, dpad_*, etc.',
      inputSchema: z.object({ key: z.enum(Object.keys(AGENT_KEYS) as [AgentKey, ...AgentKey[]]), device: deviceArg }),
    },
    async ({ key, device }) => text(await ctl.pressKey(key, device)),
  )

  s.registerTool(
    'list_apps',
    {
      description: 'List installed (user) app package names, optionally filtered by a substring.',
      inputSchema: z.object({ filter: z.string().optional(), device: deviceArg }),
    },
    async ({ filter, device }) => text((await ctl.listApps(filter, device)).join('\n') || '(none)'),
  )

  s.registerTool(
    'launch_app',
    { description: 'Open an app by package name (see list_apps).', inputSchema: z.object({ package: z.string(), device: deviceArg }) },
    async ({ package: pkg, device }) => text(await ctl.launchApp(pkg, device)),
  )

  s.registerTool(
    'unlock_phone',
    {
      description:
        'Unlock the phone’s lock screen with the PIN the user saved in Twinglass. The user must approve with Touch ID on the Mac; the PIN is never exposed to the agent. Fails if no PIN is saved or the user declines.',
      inputSchema: z.object({ device: deviceArg }),
    },
    async ({ device }) => text(await ctl.unlock(device)),
  )

  s.registerTool(
    'wait',
    {
      description: 'Wait for animations or loading (max 10 s), then take a screenshot to check.',
      inputSchema: z.object({ ms: z.number().min(50).max(10000) }),
    },
    async ({ ms }) => {
      await new Promise((r) => setTimeout(r, ms))
      return text(`Waited ${ms} ms`)
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
      ...(this.error ? { error: this.error } : {}),
    }
  }

  /** `claude mcp add` command with the token (only ever handed to the user's clipboard). */
  setupCommand(): string {
    return `claude mcp add --transport http --scope user mob-mirror ${this.status().url} --header "Authorization: Bearer ${this.settings.token}"`
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
