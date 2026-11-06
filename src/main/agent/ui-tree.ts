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
