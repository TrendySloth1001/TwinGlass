// Inspect mode geometry (pure, unit-tested): which element is under the pointer, and the spacing
// between two elements, from a screen map's display-pixel bounds.
import type { MapNode } from '../../../main/agent/screen-map'

type Box = Pick<MapNode, 'px'>

const area = (n: Box): number => (n.px[2] - n.px[0]) * (n.px[3] - n.px[1])

/** The smallest element whose bounds contain (x, y) in display pixels (the most specific one). */
export function nodeAt<T extends Box>(nodes: T[], x: number, y: number): T | null {
  let best: T | null = null
  for (const n of nodes) {
    const [l, t, r, b] = n.px
    if (x < l || x > r || y < t || y > b) continue
    if (!best || area(n) < area(best)) best = n
  }
  return best
}

/**
 * Space between two elements in dp: the horizontal gap (b's left − a's right, or the other way) and
 * the vertical one; 0 when they overlap on that axis. `inside` when one contains the other, with the
 * insets of the inner one (left, top, right, bottom).
 */
export function spacing(a: Box, b: Box, density: number): { h: number; v: number; inside?: [number, number, number, number] } {
  const [al, at, ar, ab] = a.px
  const [bl, bt, br, bb] = b.px
  const dp = (px: number): number => Math.round((px / density) * 10) / 10
  const contains = (o: Box['px'], i: Box['px']): boolean => i[0] >= o[0] && i[1] >= o[1] && i[2] <= o[2] && i[3] <= o[3]
  if (contains(a.px, b.px)) return { h: 0, v: 0, inside: [dp(bl - al), dp(bt - at), dp(ar - br), dp(ab - bb)] }
  if (contains(b.px, a.px)) return { h: 0, v: 0, inside: [dp(al - bl), dp(at - bt), dp(br - ar), dp(bb - ab)] }
  const h = bl >= ar ? bl - ar : al >= br ? al - br : 0
  const v = bt >= ab ? bt - ab : at >= bb ? at - bb : 0
  return { h: dp(h), v: dp(v) }
}
