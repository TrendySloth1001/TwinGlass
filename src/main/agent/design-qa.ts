// Design QA (pure, unit-tested): compares a Figma frame with the phone's screen map and lists what's
// off: texts missing or extra, and for every text in both, its position, size, font size and colour.
// Matching is by text (the one thing a design and a running app reliably share). The frame is
// scaled to the phone's width in dp, and the median offset of all matches is taken as the
// content's offset (status bar, scrolling), so one shifted screen doesn't flag every element.
import type { MapNode, ScreenMap } from './screen-map'

export interface FigmaRef {
  fileKey: string
  nodeId: string
}

/** A Figma link → file key and node id ("node-id=12-34" → "12:34"). Branch links use the branch key. */
export function parseFigmaUrl(url: string): FigmaRef | null {
  let u: URL
  try {
    u = new URL(url.trim())
  } catch {
    return null
  }
  if (!/(^|\.)figma\.com$/.test(u.hostname)) return null
  const parts = u.pathname.split('/').filter(Boolean)
  const kind = parts[0]
  if (!kind || !['design', 'file', 'proto'].includes(kind) || !parts[1]) return null
  const fileKey = parts[2] === 'branch' && parts[3] ? parts[3] : parts[1]
  const node = u.searchParams.get('node-id')
  if (!node || !/^\d+[-:]\d+$/.test(node)) return null
  return { fileKey, nodeId: node.replace('-', ':') }
}

export interface DesignText {
  text: string
  name: string
  /** Position and size in the frame's own units (Figma px), relative to its top-left. */
  x: number
  y: number
  w: number
  h: number
  fontSize?: number
  color?: string
}

export interface DesignFrame {
  name: string
  width: number
  height: number
  texts: DesignText[]
}

type FigmaNode = {
  id?: string
  name?: string
  type?: string
  visible?: boolean
  characters?: string
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number } | null
  style?: { fontSize?: number }
  fills?: { type?: string; visible?: boolean; opacity?: number; color?: { r: number; g: number; b: number; a?: number } }[]
  children?: FigmaNode[]
}

const hex = (c: { r: number; g: number; b: number }): string =>
  '#' + [c.r, c.g, c.b].map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('').toUpperCase()

/** The frame and every visible text inside it, from Figma's /v1/files/:key/nodes answer for one node. */
export function figmaFrame(doc: FigmaNode): DesignFrame | null {
  const box = doc.absoluteBoundingBox
  if (!box) return null
  const texts: DesignText[] = []
  const walk = (n: FigmaNode): void => {
    if (n.visible === false) return
    if (n.type === 'TEXT' && n.characters?.trim() && n.absoluteBoundingBox) {
      const b = n.absoluteBoundingBox
      const fill = n.fills?.find((f) => f.type === 'SOLID' && f.visible !== false && f.color)
      texts.push({
        text: n.characters.trim(),
        name: n.name ?? '',
        x: b.x - box.x,
        y: b.y - box.y,
        w: b.width,
        h: b.height,
        ...(n.style?.fontSize ? { fontSize: n.style.fontSize } : {}),
        ...(fill?.color ? { color: hex(fill.color) } : {}),
      })
    }
    for (const c of n.children ?? []) walk(c)
  }
  walk(doc)
  return { name: doc.name ?? 'Frame', width: box.width, height: box.height, texts }
}

export type IssueKind = 'missing' | 'extra' | 'position' | 'size' | 'font' | 'color'

export interface DesignIssue {
  kind: IssueKind
  text: string
  /** What the design says and what the screen shows (dp, sp or hex). */
  design?: string
  screen?: string
  /** Signed difference, screen minus design. */
  delta?: number
}

export interface DesignReport {
  frame: string
  /** Design units per dp: the frame is drawn at this width relative to the phone. */
  scale: number
  /** Where the design's content sits on screen (median of all matches), ignored in the checks. */
  offset: { dx: number; dy: number }
  matched: number
  issues: DesignIssue[]
}

export interface CompareOptions {
  /** Tolerances: position and size in dp, font size in sp, colour as RGB distance (0–441). */
  posDp?: number
  sizeDp?: number
  fontSp?: number
  color?: number
}

const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim()
const median = (v: number[]): number => {
  if (!v.length) return 0
  const s = [...v].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}
const r1 = (n: number): number => Math.round(n * 10) / 10
const rgb = (h: string): [number, number, number] | null => {
  const m = /^#?([0-9a-f]{6})$/i.exec(h)
  if (!m) return null
  const v = parseInt(m[1]!, 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}
const colorDistance = (a: string, b: string): number | null => {
  const x = rgb(a)
  const y = rgb(b)
  return x && y ? Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) : null
}
const sp = (s?: string): number | null => {
  const m = /^([\d.]+)sp$/.exec(s ?? '')
  return m ? Number(m[1]) : null
}

export function compareDesign(frame: DesignFrame, map: ScreenMap, o: CompareOptions = {}): DesignReport {
  const tol = { posDp: o.posDp ?? 2, sizeDp: o.sizeDp ?? 4, fontSp: o.fontSp ?? 0.5, color: o.color ?? 48 }
  // A frame drawn at the phone's width in dp has scale 1 (Figma px = dp).
  const scale = frame.width / map.display.widthDp
  // Real text elements only: a container labelled with its title (a toolbar "Battery", 411 dp wide)
  // or an icon's description ("Navigate up") isn't a text a design would draw.
  const isText = (n: MapNode): boolean => !!n.textSize || (/(Text|Button)/.test(n.kind) && !/Image/.test(n.kind))
  const onScreen = map.nodes.filter((n) => n.text?.trim() && isText(n))
  const used = new Set<MapNode>()
  const pairs: { d: DesignText; n: MapNode }[] = []
  const issues: DesignIssue[] = []
  for (const d of frame.texts) {
    // The first unused element with the same text, nearest to where the design puts it.
    const want = norm(d.text)
    const cands = onScreen.filter((n) => !used.has(n) && norm(n.text!) === want)
    if (!cands.length) {
      issues.push({ kind: 'missing', text: d.text, design: `at ${r1(d.x / scale)}, ${r1(d.y / scale)} dp` })
      continue
    }
    const best = cands.reduce((a, b) => (Math.hypot(a.x - d.x / scale, a.y - d.y / scale) <= Math.hypot(b.x - d.x / scale, b.y - d.y / scale) ? a : b))
    used.add(best)
    pairs.push({ d, n: best })
  }
  const dx = median(pairs.map(({ d, n }) => n.x - d.x / scale))
  const dy = median(pairs.map(({ d, n }) => n.y - d.y / scale))
  for (const { d, n } of pairs) {
    const ex = n.x - d.x / scale - dx
    const ey = n.y - d.y / scale - dy
    if (Math.abs(ex) > tol.posDp || Math.abs(ey) > tol.posDp) {
      issues.push({
        kind: 'position',
        text: d.text,
        design: `${r1(d.x / scale + dx)}, ${r1(d.y / scale + dy)} dp`,
        screen: `${r1(n.x)}, ${r1(n.y)} dp`,
        delta: r1(Math.abs(ex) > Math.abs(ey) ? ex : ey),
      })
    }
    const ew = n.w - d.w / scale
    if (Math.abs(ew) > tol.sizeDp) issues.push({ kind: 'size', text: d.text, design: `${r1(d.w / scale)} dp wide`, screen: `${r1(n.w)} dp wide`, delta: r1(ew) })
    const want = d.fontSize ? d.fontSize / scale : null
    const got = sp(n.textSize)
    if (want && got && Math.abs(got - want) > tol.fontSp) issues.push({ kind: 'font', text: d.text, design: `${r1(want)} sp`, screen: `${got} sp`, delta: r1(got - want) })
    const dist = d.color && n.foreground ? colorDistance(d.color, n.foreground) : null
    if (dist !== null && dist > tol.color) issues.push({ kind: 'color', text: d.text, design: d.color, screen: n.foreground })
  }
  for (const n of onScreen) if (!used.has(n)) issues.push({ kind: 'extra', text: n.text!.trim(), screen: `at ${r1(n.x)}, ${r1(n.y)} dp` })
  const order: IssueKind[] = ['missing', 'position', 'size', 'font', 'color', 'extra']
  issues.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))
  return { frame: frame.name, scale: r1(scale * 100) / 100, offset: { dx: r1(dx), dy: r1(dy) }, matched: pairs.length, issues }
}
