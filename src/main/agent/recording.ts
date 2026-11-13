// Recording (pure, unit-tested): turns a tap at a screen position into a step that names the element
// under it, from the screen's element tree read just before the tap. Replays then find the element
// again by its text or id (tap_element), with the same match index tap_element uses.
import type { NormPoint, TestStep } from '@shared/tests'
import type { Size } from './geometry'
import { clickableAround, matchNodes, type UiNode } from './ui-tree'

const area = (n: UiNode): number => (n.bounds[2] - n.bounds[0]) * (n.bounds[3] - n.bounds[1])
const inside = (n: UiNode, x: number, y: number): boolean => x >= n.bounds[0] && x <= n.bounds[2] && y >= n.bounds[1] && y <= n.bounds[3]

/** The element a tap at (x, y) hits that can be named: the smallest one with text or an id. */
function namedAt(nodes: UiNode[], x: number, y: number): UiNode | null {
  let best: UiNode | null = null
  for (const n of nodes) {
    if (!inside(n, x, y) || (!n.label.trim() && !n.id)) continue
    if (!best || area(n) < area(best)) best = n
  }
  // A pressable row hit on its padding: name it by the text inside it.
  if (best && !best.label.trim() && !best.id) best = null
  return best
}

/** The match index tap_element will use for this query: pressable matches first, then tree order. */
function indexOf(nodes: UiNode[], q: { text?: string; id?: string; exact?: boolean }, target: UiNode): number {
  const found = matchNodes(nodes, q)
  const ordered = [...found.filter((n) => n.clickable), ...found.filter((n) => !n.clickable)]
  return Math.max(0, ordered.indexOf(target))
}

/** A recorded tap (or long press) at a normalised point → a step naming the element, if it can. */
export function describeTap(nodes: UiNode[], space: Size, at: NormPoint, long = false): TestStep {
  const x = at[0] * space.width
  const y = at[1] * space.height
  const named = namedAt(nodes, x, y)
  const p: NormPoint = [round(at[0]), round(at[1])]
  // Nothing to name, or only a big unlabelled container (a pager, a feed, a map: pressing it by id
  // would press its middle, not where the tap was): keep the position.
  const big = named && !named.label.trim() && area(named) > 0.2 * space.width * space.height
  if (!named || big) return { action: 'tap', at: p, ...(long ? { long: true } : {}) }
  // Prefer the visible text (what a person reads); an id when there is no text.
  const text = named.label.trim()
  const q = text ? { text, exact: true } : { id: named.id }
  // The element a replay will press must be the one pressed now (or the row around it).
  const pressed = clickableAround(nodes, named)
  // Rows often carry their inner text as their own label: count from the row then (what replays press).
  const same = (a: string, b: string): boolean => a.toLowerCase().replace(/\s+/g, ' ').trim() === b.toLowerCase().replace(/\s+/g, ' ').trim()
  const index = indexOf(nodes, q, pressed && text && same(pressed.label, text) ? pressed : named)
  if (pressed && !inside(pressed, x, y) && !inside(named, x, y)) return { action: 'tap', at: p, ...(long ? { long: true } : {}) }
  return { action: 'tap_element', ...q, ...(index ? { index } : {}), ...(long ? { long: true } : {}), at: p }
}

/** A check (“this must be on screen”) on the element at a normalised point, or null if none can be named. */
export function describeCheck(nodes: UiNode[], space: Size, at: NormPoint): TestStep | null {
  const named = namedAt(nodes, at[0] * space.width, at[1] * space.height)
  if (!named) return null
  const text = named.label.trim()
  return text ? { action: 'wait_for', text, exact: true } : { action: 'wait_for', id: named.id }
}

const round = (n: number): number => Math.round(n * 10_000) / 10_000
