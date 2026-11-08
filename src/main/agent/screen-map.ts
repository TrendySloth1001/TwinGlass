// Screen map for agents (pure, unit-tested): the exact layout of a screen in dp, so an agent that
// rebuilds or checks a UI uses real dimensions instead of guessing from pixels.
// Input: the phone app's `map` answer (AgentService.map: every visible view with bounds in display
// pixels, layout size and text size when the app's views expose them) + the display's size and dpi.

export interface RawMapNode {
  ref: string
  d: number
  cls: string
  text?: string
  desc?: string
  hint?: string
  id?: string
  pkg: string
  b: [number, number, number, number]
  f?: string
  children?: number
  /** Layout params in px; -1 match_parent, -2 wrap_content. */
  lw?: number
  lh?: number
  /** Text size in px and the unit the app declared (TypedValue: 0 px, 1 dp, 2 sp). */
  tpx?: number
  tunit?: number
}

export interface RawMapWindow {
  index: number
  type: number
  title: string
  pkg: string
  b: [number, number, number, number]
}

export interface DisplayInfo {
  width: number
  height: number
  dpi: number
  /** System font scale (Settings → font size); sp = px / (density × fontScale). Default 1. */
  fontScale?: number
}

type Dim = number | 'match_parent' | 'wrap_content'

export interface MapNode {
  /** Short id for this map ("n12"); the annotated image uses the same numbers. */
  n: string
  parent?: string
  depth: number
  kind: string
  text?: string
  hint?: string
  id?: string
  app: string
  /** Position and size in dp, relative to the display's top-left. */
  x: number
  y: number
  w: number
  h: number
  /** Exact bounds in display pixels [left, top, right, bottom]. */
  px: [number, number, number, number]
  /** Distance to the parent's edges in dp (left, top, right, bottom): margins + parent padding. */
  inset?: [number, number, number, number]
  /** Gap in dp to the previous sibling (below it, or right of it). */
  gap?: { after: string; dp: number; axis: 'vertical' | 'horizontal' }
  layout?: { width?: Dim; height?: Dim }
  /** Text size in the unit the app used ("16sp"), when known. */
  textSize?: string
  flags?: string
  /** Sampled from the live frame (hex), when available. */
  background?: string
  foreground?: string
  /** Element ref for tap_element / set_text. */
  ref: string
  /** Centre in screenshot (agent) coordinates, for tap. */
  tap?: [number, number]
}

export interface ScreenMap {
  display: { widthPx: number; heightPx: number; dpi: number; density: number; fontScale: number; widthDp: number; heightDp: number }
  statusBar?: { heightDp: number }
  navigationBar?: { heightDp: number; position: 'bottom' | 'left' | 'right' }
  keyboard?: { heightDp: number }
  /** The app's usable area in dp (between the system bars). */
  content: { x: number; y: number; w: number; h: number }
  nodes: MapNode[]
  summary: {
    textSizes: { size: string; count: number; examples: string[] }[]
    spacing: { dp: number; count: number }[]
    keylines: { xDp: number; count: number }[]
    repeated: { w: number; h: number; count: number; parent?: string; example?: string }[]
    colors?: { hex: string; count: number }[]
  }
  truncated: boolean
}

const TYPE_APPLICATION = 1
const TYPE_INPUT_METHOD = 2
const TYPE_SYSTEM = 3

/**
 * The value a designer most likely wrote, given that Android rounded it to whole pixels: of all
 * values within ±`tol` px of the measurement, prefer a whole number, then a half, else 0.1 steps.
 * E.g. 47 px at 2.625 → 18 (not 17.9): 18sp = 47.25 px, rounded to 47 by the app.
 */
export function nice(px: number, per: number, tol = 0.5): number {
  const lo = (px - tol) / per
  const hi = (px + tol) / per
  const whole = Math.round(px / per)
  if (whole >= lo && whole <= hi) return whole
  const half = Math.round((px / per) * 2) / 2
  if (half >= lo && half <= hi) return half
  return Math.round((px / per) * 10) / 10
}

/** Positions: one rounded pixel edge (±0.5 px). */
const dp = (px: number, density: number): number => nice(px, density, 0.5)
/** Sizes: two rounded edges (±1 px). */
const dpSize = (px: number, density: number): number => nice(px, density, 1)

function dim(v: number | undefined, density: number): Dim | undefined {
  if (v === undefined) return undefined
  if (v === -1) return 'match_parent'
  if (v === -2) return 'wrap_content'
  return v >= 0 ? dpSize(v, density) : undefined
}

function textSize(px: number | undefined, unit: number | undefined, density: number, fontScale: number): string | undefined {
  if (!px) return undefined
  if (unit === 0) return `${Math.round(px)}px`
  if (unit === 1) return `${nice(px, density)}dp`
  return `${nice(px, density * fontScale)}sp` // sp includes the user's font size setting
}

const isAncestor = (a: string, b: string): boolean => b.startsWith(`${a}.`)

function counted<T extends string | number>(xs: T[]): { v: T; count: number }[] {
  const m = new Map<T, number>()
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1)
  return [...m].map(([v, count]) => ({ v, count })).sort((a, b) => b.count - a.count)
}

export interface MapOptions {
  /** Only these apps' views (default: the app windows; system UI excluded). */
  app?: string
  /** Include status bar, navigation bar and other system windows' views. */
  includeSystem?: boolean
  /** Agent (screenshot) space, to add tap coordinates. */
  agent?: { width: number; height: number }
  /** Drop layout-only containers that add nothing (no text/id/size info and a single child). */
  compact?: boolean
}

export function buildScreenMap(raw: { nodes?: unknown; windows?: unknown; truncated?: unknown }, display: DisplayInfo, o: MapOptions = {}): ScreenMap {
  const density = display.dpi / 160
  const wins = (Array.isArray(raw.windows) ? raw.windows : []) as RawMapWindow[]
  const all = ((Array.isArray(raw.nodes) ? raw.nodes : []) as RawMapNode[]).filter((n) => Array.isArray(n.b) && n.b.length === 4)

  // System bars from the window list: system windows touching the top / bottom / sides.
  let statusPx = 0
  let navPx = 0
  let navPos: 'bottom' | 'left' | 'right' = 'bottom'
  let imePx = 0
  for (const w of wins) {
    const [l, t, r, b] = w.b
    if (w.type === TYPE_SYSTEM) {
      if (t <= 0 && b < display.height / 3 && r - l > display.width / 2) statusPx = Math.max(statusPx, b)
      else if (b >= display.height && t > display.height / 2) navPx = Math.max(navPx, display.height - t)
      else if (l <= 0 && r < display.width / 3) ((navPx = r), (navPos = 'left'))
      else if (r >= display.width && l > display.width / 2) ((navPx = display.width - l), (navPos = 'right'))
    }
    if (w.type === TYPE_INPUT_METHOD && b > t) imePx = Math.max(imePx, b - t)
  }

  const windowOf = (ref: string): RawMapWindow | undefined => wins.find((w) => w.index === Number(ref.split('.')[0]))
  const keep = all.filter((n) => {
    if (o.app) return n.pkg === o.app
    if (o.includeSystem) return true
    const w = windowOf(n.ref)
    return !w || w.type === TYPE_APPLICATION || w.type === TYPE_INPUT_METHOD
  })

  const informative = (n: RawMapNode): boolean =>
    !!(n.text || n.desc || n.hint || n.id || n.f || n.tpx || (n.lw !== undefined && n.lw >= 0) || (n.lh !== undefined && n.lh >= 0))
  const list = o.compact ? keep.filter((n, i) => informative(n) || (n.children ?? 0) !== 1 || i === 0) : keep

  const byRef = new Map(list.map((n) => [n.ref, n]))
  const nameOf = new Map(list.map((n, i) => [n.ref, `n${i + 1}`]))
  const parentOf = (ref: string): RawMapNode | undefined => {
    const parts = ref.split('.')
    for (let k = parts.length - 1; k > 0; k--) {
      const p = byRef.get(parts.slice(0, k).join('.'))
      if (p) return p
    }
    return undefined
  }

  const nodes: MapNode[] = []
  const lastChild = new Map<string, RawMapNode>()
  for (const r of list) {
    const [l, t, rr, bb] = r.b
    const parent = parentOf(r.ref)
    const node: MapNode = {
      n: nameOf.get(r.ref)!,
      ...(parent ? { parent: nameOf.get(parent.ref)! } : {}),
      depth: r.d,
      kind: r.cls,
      ...(r.text || r.desc ? { text: (r.text || r.desc)!.trim() } : {}),
      ...(r.hint ? { hint: r.hint } : {}),
      ...(r.id ? { id: r.id.split(':id/')[1] ?? r.id } : {}),
      app: r.pkg,
      x: dp(l, density),
      y: dp(t, density),
      w: dpSize(rr - l, density),
      h: dpSize(bb - t, density),
      px: [l, t, rr, bb],
      ref: r.ref,
    }
    if (parent) {
      const [pl, pt, pr, pb] = parent.b
      // Differences of two rounded edges: size tolerance.
      node.inset = [dpSize(l - pl, density), dpSize(t - pt, density), dpSize(pr - rr, density), dpSize(pb - bb, density)]
      const prev = lastChild.get(parent.ref)
      if (prev) {
        const [, , prr, pbb] = prev.b
        if (t >= pbb) node.gap = { after: nameOf.get(prev.ref)!, dp: dpSize(t - pbb, density), axis: 'vertical' }
        else if (l >= prr) node.gap = { after: nameOf.get(prev.ref)!, dp: dpSize(l - prr, density), axis: 'horizontal' }
      }
      lastChild.set(parent.ref, r)
    }
    const width = dim(r.lw, density)
    const height = dim(r.lh, density)
    if (width !== undefined || height !== undefined) node.layout = { ...(width !== undefined ? { width } : {}), ...(height !== undefined ? { height } : {}) }
    const ts = textSize(r.tpx, r.tunit, density, display.fontScale ?? 1)
    if (ts) node.textSize = ts
    if (r.f) node.flags = r.f
    if (o.agent) {
      const cx = ((Math.max(l, 0) + Math.min(rr, display.width)) / 2 / display.width) * o.agent.width
      const cy = ((Math.max(t, 0) + Math.min(bb, display.height)) / 2 / display.height) * o.agent.height
      node.tap = [Math.min(Math.round(cx), o.agent.width - 1), Math.min(Math.round(cy), o.agent.height - 1)]
    }
    nodes.push(node)
  }

  // ---- design summary ----
  const textSizes = counted(nodes.filter((n) => n.textSize).map((n) => n.textSize!)).map(({ v, count }) => ({
    size: v,
    count,
    examples: nodes
      .filter((n) => n.textSize === v && n.text)
      .slice(0, 3)
      .map((n) => n.text!.slice(0, 40)),
  }))
  const spacing = counted(nodes.filter((n) => n.gap && n.gap.dp > 0 && n.gap.dp <= 64).map((n) => n.gap!.dp))
    .slice(0, 8)
    .map(({ v, count }) => ({ dp: v, count }))
  const keylines = counted(nodes.filter((n) => n.text || n.flags?.includes('click')).map((n) => n.x))
    .filter((k) => k.count >= 2)
    .slice(0, 8)
    .map(({ v, count }) => ({ xDp: v, count }))
  const sameSize = new Map<string, MapNode[]>()
  for (const n of nodes) {
    if (!n.parent || n.w < 16 || n.h < 16) continue
    const k = `${n.parent}|${n.w}x${n.h}`
    sameSize.set(k, [...(sameSize.get(k) ?? []), n])
  }
  const repeated = [...sameSize.values()]
    .filter((g) => g.length >= 3)
    .sort((a, b) => b.length - a.length)
    .slice(0, 6)
    .map((g) => ({ w: g[0]!.w, h: g[0]!.h, count: g.length, parent: g[0]!.parent, example: nodes.find((n) => n.parent === g[0]!.n && n.text)?.text ?? g[0]!.text }))

  const statusDp = dp(statusPx, density)
  const navDp = dp(navPx, density)
  const widthDp = dp(display.width, density)
  const heightDp = dp(display.height, density)
  return {
    display: { widthPx: display.width, heightPx: display.height, dpi: display.dpi, density, fontScale: display.fontScale ?? 1, widthDp, heightDp },
    ...(statusPx ? { statusBar: { heightDp: statusDp } } : {}),
    ...(navPx ? { navigationBar: { heightDp: navDp, position: navPos } } : {}),
    ...(imePx ? { keyboard: { heightDp: dp(imePx, density) } } : {}),
    content: {
      x: navPos === 'left' ? navDp : 0,
      y: statusDp,
      w: Math.round((widthDp - (navPos !== 'bottom' ? navDp : 0)) * 10) / 10,
      h: Math.round((heightDp - statusDp - (navPos === 'bottom' ? navDp : 0)) * 10) / 10,
    },
    nodes,
    summary: { textSizes, spacing, keylines, repeated },
    truncated: raw.truncated === true,
  }
}

// ---- colours from the live frame ----

const hex = (r: number, g: number, b: number): string => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`

/**
 * Background (most common colour on the element's edge) and foreground (most common colour
 * inside that clearly differs from the background: text / icon colour) per node.
 * `bgra`: the frame as BGRA bytes (nativeImage.toBitmap), `fw`×`fh` pixels, covering the display.
 */
export function sampleColors(bgra: Uint8Array, fw: number, fh: number, display: DisplayInfo, nodes: MapNode[]): { hex: string; count: number }[] {
  const sx = fw / display.width
  const sy = fh / display.height
  const at = (x: number, y: number): [number, number, number] => {
    const i = (Math.min(fh - 1, Math.max(0, Math.round(y))) * fw + Math.min(fw - 1, Math.max(0, Math.round(x)))) * 4
    return [bgra[i + 2]!, bgra[i + 1]!, bgra[i]!]
  }
  const key = ([r, g, b]: [number, number, number]): number => ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)
  const mode = (px: [number, number, number][]): [number, number, number] | null => {
    if (!px.length) return null
    const groups = new Map<number, [number, number, number, number]>()
    for (const p of px) {
      const k = key(p)
      const g = groups.get(k) ?? [0, 0, 0, 0]
      groups.set(k, [g[0] + p[0], g[1] + p[1], g[2] + p[2], g[3] + 1])
    }
    const best = [...groups.values()].sort((a, b) => b[3] - a[3])[0]!
    return [best[0] / best[3], best[1] / best[3], best[2] / best[3]]
  }
  const palette = new Map<string, number>()
  for (const n of nodes) {
    const [l, t, r, b] = n.px
    const x1 = l * sx
    const y1 = t * sy
    const x2 = r * sx - 1
    const y2 = b * sy - 1
    if (x2 - x1 < 3 || y2 - y1 < 3) continue
    const edge: [number, number, number][] = []
    const steps = 24
    for (let i = 0; i <= steps; i++) {
      const fx = x1 + 1 + ((x2 - x1 - 2) * i) / steps
      const fy = y1 + 1 + ((y2 - y1 - 2) * i) / steps
      edge.push(at(fx, y1 + 1), at(fx, y2 - 1), at(x1 + 1, fy), at(x2 - 1, fy))
    }
    const bg = mode(edge)
    if (!bg) continue
    n.background = hex(...bg)
    palette.set(n.background, (palette.get(n.background) ?? 0) + 1)
    if (n.text || n.kind.includes('Image') || n.kind.includes('Icon')) {
      const inside: [number, number, number][] = []
      for (let i = 1; i < 16; i++) for (let j = 1; j < 16; j++) inside.push(at(x1 + ((x2 - x1) * i) / 16, y1 + ((y2 - y1) * j) / 16))
      const far = inside.filter((p) => Math.abs(p[0] - bg[0]) + Math.abs(p[1] - bg[1]) + Math.abs(p[2] - bg[2]) > 90)
      const fg = far.length >= 3 ? mode(far) : null
      if (fg) n.foreground = hex(...fg)
    }
  }
  // Merge near-identical colours (video compression noise: #343129 vs #34312a) into the most used.
  const rgb = (h: string): number[] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  const merged: { hex: string; count: number }[] = []
  for (const [h, count] of [...palette].sort((a, b) => b[1] - a[1])) {
    const c = rgb(h)
    const near = merged.find((m) => rgb(m.hex).reduce((s, v, i) => s + Math.abs(v - c[i]!), 0) <= 12)
    if (near) near.count += count
    else merged.push({ hex: h, count })
  }
  // Snap each node's colours to its palette entry, so equal-looking colours read equal.
  const snap = (h?: string): string | undefined => {
    if (!h) return h
    const c = rgb(h)
    return merged.find((m) => rgb(m.hex).reduce((s, v, i) => s + Math.abs(v - c[i]!), 0) <= 12)?.hex ?? h
  }
  for (const n of nodes) n.background = snap(n.background)
  return merged.slice(0, 10)
}
