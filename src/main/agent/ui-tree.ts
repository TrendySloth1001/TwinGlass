// Compact, agent-friendly view of `uiautomator dump` XML (pure, unit-tested).
import { mapPoint, type Size } from './geometry'

export interface UiNode {
  /** Visible text or content-description. */
  label: string
  /** resource-id without the package prefix ("com.app:id/send" -> "send"). */
  id?: string
  /** Short class name ("android.widget.Button" -> "Button"). */
  kind: string
  clickable: boolean
  /** Centre and bounds in agent (screenshot) coordinates: tap `center` to hit the element. */
  center: [number, number]
  bounds: [number, number, number, number]
  flags?: string
  /** Element handle for tap_element / set_text (from the phone app's accessibility service). */
  ref?: string
  /** App the element belongs to. */
  app?: string
  /** Placeholder text of an empty field. */
  hint?: string
}

/** Which element(s): text/label (substring, case-insensitive unless exact), resource id, or ref. */
export interface NodeQuery {
  text?: string
  id?: string
  ref?: string
  exact?: boolean
  /** Which match when several (0 = first, top-left first). */
  index?: number
}

export function matchNodes(nodes: UiNode[], q: NodeQuery): UiNode[] {
  const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim()
  const t = q.text ? norm(q.text) : null
  // Ids are stored without the package prefix ("com.app:id/send" → "send"); accept either.
  const wantId = q.id ? (q.id.split(':id/')[1] ?? q.id) : null
  return nodes.filter((n) => {
    if (q.ref && n.ref !== q.ref) return false
    if (wantId && n.id !== wantId) return false
    if (t) {
      const hay = [n.label, n.hint ?? ''].map(norm)
      if (!hay.some((h) => (q.exact ? h === t : h.includes(t)))) return false
    }
    return true
  })
}

/**
 * The phone app's accessibility tree ({ nodes: [{ ref, text, desc, hint, id, cls, pkg, b, f }] },
 * bounds in display pixels) → agent-space nodes. Same shape as parseUiDump, plus refs.
 */
export function parseA11yTree(res: Record<string, unknown>, device: Size, agent: Size, limit = 600): UiNode[] {
  const raw = Array.isArray(res.nodes) ? (res.nodes as Record<string, unknown>[]) : []
  const out: UiNode[] = []
  const str = (v: unknown): string => (typeof v === 'string' ? v : '')
  for (const r of raw) {
    const b = Array.isArray(r.b) ? (r.b as number[]) : []
    if (b.length !== 4 || !b.every(Number.isFinite)) continue
    const [x1, y1, x2, y2] = b as [number, number, number, number]
    if (x2 <= x1 || y2 <= y1 || x2 <= 0 || y2 <= 0 || x1 >= device.width || y1 >= device.height) continue
    const f = new Set(str(r.f).split(',').filter(Boolean))
    const p1 = mapPoint({ x: x1, y: y1 }, device, agent)
    const p2 = mapPoint({ x: x2, y: y2 }, device, agent)
    const c = mapPoint({ x: (Math.max(x1, 0) + Math.min(x2, device.width)) / 2, y: (Math.max(y1, 0) + Math.min(y2, device.height)) / 2 }, device, agent)
    const flags = [
      f.has('scroll') && 'scrollable',
      f.has('edit') && 'editable',
      f.has('checked') && 'checked',
      f.has('selected') && 'selected',
      f.has('focused') && 'focused',
      f.has('disabled') && 'disabled',
      f.has('password') && 'password',
    ]
      .filter(Boolean)
      .join(',')
    const id = str(r.id).split(':id/')[1] ?? (str(r.id) || undefined)
    const hint = str(r.hint)
    out.push({
      label: (str(r.text) || str(r.desc)).trim(),
      ...(id ? { id } : {}),
      kind: str(r.cls) || 'View',
      clickable: f.has('click') || f.has('long'),
      center: [c.x, c.y],
      bounds: [p1.x, p1.y, p2.x, p2.y],
      ...(flags ? { flags } : {}),
      ref: str(r.ref),
      ...(str(r.pkg) ? { app: str(r.pkg) } : {}),
      ...(hint ? { hint } : {}),
    })
    if (out.length >= limit) break
  }
  return out
}

const ATTR = /([\w-]+)="([^"]*)"/g

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of tag.matchAll(ATTR)) out[m[1]!] = decode(m[2]!)
  return out
}

function decode(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&')
}

/**
 * Keeps nodes an agent can act on or read: anything with text/description, or clickable /
 * scrollable / editable. Coordinates are mapped from device pixels into the agent space.
 */
export function parseUiDump(xml: string, device: Size, agent: Size, limit = 300): UiNode[] {
  const nodes: UiNode[] = []
  for (const m of xml.matchAll(/<node\b[^>]*>/g)) {
    const a = attrs(m[0])
    const b = /\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/.exec(a.bounds ?? '')
    if (!b) continue
    const [x1, y1, x2, y2] = [Number(b[1]), Number(b[2]), Number(b[3]), Number(b[4])]
    if (x2 <= x1 || y2 <= y1) continue
    const label = (a.text || a['content-desc'] || '').trim()
    const clickable = a.clickable === 'true' || a['long-clickable'] === 'true'
    const scrollable = a.scrollable === 'true'
    const editable = (a.class ?? '').includes('EditText')
    if (!label && !clickable && !scrollable && !editable) continue
    const p1 = mapPoint({ x: x1, y: y1 }, device, agent)
    const p2 = mapPoint({ x: x2, y: y2 }, device, agent)
    const c = mapPoint({ x: (x1 + x2) / 2, y: (y1 + y2) / 2 }, device, agent)
    const flags = [
      scrollable && 'scrollable',
      editable && 'editable',
      a.checked === 'true' && 'checked',
      a.selected === 'true' && 'selected',
      a.focused === 'true' && 'focused',
      a.enabled === 'false' && 'disabled',
    ]
      .filter(Boolean)
      .join(',')
    const id = a['resource-id']?.split(':id/')[1]
    nodes.push({
      label,
      ...(id ? { id } : {}),
      kind: (a.class ?? '').split('.').pop() || 'View',
      clickable,
      center: [c.x, c.y],
      bounds: [p1.x, p1.y, p2.x, p2.y],
      ...(flags ? { flags } : {}),
    })
    if (nodes.length >= limit) break
  }
  return nodes
}

/** Escapes text for `adb shell input text` (spaces become %s; shell metacharacters escaped). */
export function escapeInputText(text: string): string {
  return text.replace(/([\\"'`$&|;<>(){}[\]*?!~#])/g, '\\$1').replace(/ /g, '%s')
}
