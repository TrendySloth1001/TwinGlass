// Bridge to the Twinglass phone app's AgentService (accessibility): UI trees and element actions
// on ANY display, including the agents' second screen (`uiautomator dump` only sees display 0).
// Requests go through `am broadcast` (adb only: the receiver needs the DUMP permission) and the
// answer comes back as the broadcast's result data, base64 JSON, printed by `am`.
import type { Adb } from '../adb/adb'
import { COMPANION_PKG } from '../companion-link'
import { shellQuote } from '../phone-apps'

export const AGENT_SERVICE = `${COMPANION_PKG}/.AgentService`

/** "Broadcast completed: result=0, data=\"<base64>\"" → parsed JSON; null when there's no data. */
export function parseBroadcastResult(out: string): Record<string, unknown> | null {
  const m = /Broadcast completed: result=-?\d+, data="([A-Za-z0-9+/=]+)"/.exec(out)
  if (!m) return null
  try {
    return JSON.parse(Buffer.from(m[1]!, 'base64').toString('utf8')) as Record<string, unknown>
  } catch {
    return null
  }
}

export type BridgeOp = 'ping' | 'tree' | 'map' | 'click' | 'long_click' | 'set_text' | 'focus' | 'scroll_forward' | 'scroll_backward'

export class BridgeError extends Error {
  constructor(
    readonly code: 'no-app' | 'a11y-off' | 'failed',
    message: string,
  ) {
    super(message)
  }
}

export async function bridgeCall(
  adb: Adb,
  serial: string,
  op: BridgeOp,
  args: { display?: number; ref?: string; text?: string; limit?: number; rendering?: boolean } = {},
): Promise<Record<string, unknown>> {
  const parts = [`am broadcast -n ${COMPANION_PKG}/.AgentReceiver --es op ${op}`]
  if (args.display !== undefined) parts.push(`--ei display ${Math.trunc(args.display)}`)
  if (args.ref !== undefined) {
    if (!/^\d+(\.\d+)*$/.test(args.ref)) throw new BridgeError('failed', `bad element ref "${args.ref}"`)
    parts.push(`--es ref ${args.ref}`)
  }
  if (args.text !== undefined) parts.push(`--es text ${shellQuote(args.text)}`)
  if (args.limit !== undefined) parts.push(`--ei limit ${Math.trunc(args.limit)}`)
  if (args.rendering !== undefined) parts.push(`--ez rendering ${args.rendering}`)
  const out = await adb.runLoose(['shell', parts.join(' ')], serial, 15_000)
  const res = parseBroadcastResult(out)
  if (!res) throw new BridgeError('no-app', 'The Twinglass phone app (0.4.0 or newer) is not installed on this phone.')
  if (res.ok === false && res.error === 'a11y-off') {
    throw new BridgeError('a11y-off', 'Agent screen reading is off. Turn on "Agents read any screen" in Twinglass → Settings → Agents.')
  }
  return res
}

/** Is our accessibility service switched on in the phone's settings? */
export async function agentServiceEnabled(adb: Adb, serial: string): Promise<boolean> {
  const out = await adb.runLoose(['shell', 'settings get secure enabled_accessibility_services'], serial, 5000)
  return parseServices(out).some(isOurs)
}

const isOurs = (s: string): boolean => s === AGENT_SERVICE || s === `${COMPANION_PKG}/${COMPANION_PKG}.AgentService`

export function parseServices(out: string): string[] {
  const t = out.trim()
  return !t || t === 'null' ? [] : t.split(':').filter(Boolean)
}

/** Adds or removes our service, keeping the user's other accessibility services as they are. */
export function nextServices(current: string[], on: boolean): string[] {
  const others = current.filter((s) => !isOurs(s))
  return on ? [...others, AGENT_SERVICE] : others
}

export async function setAgentService(adb: Adb, serial: string, on: boolean): Promise<boolean> {
  const cur = parseServices(await adb.runLoose(['shell', 'settings get secure enabled_accessibility_services'], serial, 5000))
  const next = nextServices(cur, on)
  if (next.length) await adb.runLoose(['shell', `settings put secure enabled_accessibility_services ${shellQuote(next.join(':'))}`], serial, 5000)
  else await adb.runLoose(['shell', 'settings delete secure enabled_accessibility_services'], serial, 5000)
  if (on) await adb.runLoose(['shell', 'settings put secure accessibility_enabled 1'], serial, 5000)
  return agentServiceEnabled(adb, serial)
}

// ---- notifications (`dumpsys notification --noredact`) ----

export interface PhoneNotification {
  app: string
  title: string
  text: string
  /** epoch ms */
  when: number | null
  ongoing: boolean
}

export function parseNotifications(out: string): PhoneNotification[] {
  const list: PhoneNotification[] = []
  const blocks = out.split(/\n\s*NotificationRecord\(/).slice(1)
  for (const b of blocks) {
    const app = /pkg=([\w.]+)/.exec(b)?.[1]
    if (!app) continue
    const val = (k: string): string => {
      const m = new RegExp(`android\\.${k}=(?:String|SpannableString|SpannedString)? ?\\((.*)\\)\\s*$`, 'm').exec(b)
      return m?.[1]?.trim() ?? ''
    }
    const title = val('title')
    const text = val('bigText') || val('text')
    if (!title && !text) continue
    const when = /\bwhen=(\d+)/.exec(b)?.[1]
    list.push({ app, title, text, when: when && when !== '0' ? Number(when) : null, ongoing: /flags=[^\s)]*ONGOING_EVENT/.test(b) })
  }
  return list.sort((a, b) => (b.when ?? 0) - (a.when ?? 0))
}
