// Accessibility audit (pure, unit-tested) from a screen map: the checks Android's guidelines and the
// Play Console's pre-launch report care about most, on whatever is on screen right now.
//  - touch targets under 48×48 dp on pressable elements
//  - pressable elements nothing names (no text or description in them): screen readers say nothing
//  - text contrast below WCAG AA (4.5:1, or 3:1 for large text), from the sampled colours
//  - text under 12 sp
import type { MapNode, ScreenMap } from '../main/agent/screen-map'

export type AuditKind = 'target' | 'label' | 'contrast' | 'text-size'

export interface AuditIssue {
  kind: AuditKind
  /** The map's node id ("n12"), to highlight it. */
  n: string
  severity: 'error' | 'warning'
  message: string
}

const MIN_TARGET_DP = 48
const MIN_TEXT_SP = 12

function luminance(hex: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return null
  const v = parseInt(m[1]!, 16)
  const ch = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!
}

/** WCAG contrast ratio of two hex colours (1–21), or null when either can't be read. */
export function contrastRatio(a: string, b: string): number | null {
  const x = luminance(a)
  const y = luminance(b)
  if (x === null || y === null) return null
  const [hi, lo] = x > y ? [x, y] : [y, x]
  return (hi + 0.05) / (lo + 0.05)
}

const sp = (s?: string): number | null => {
  const m = /^([\d.]+)sp$/.exec(s ?? '')
  return m ? Number(m[1]) : null
}
const isPressable = (n: MapNode): boolean => /\bclick\b/.test(n.flags ?? '')

export function auditScreen(map: ScreenMap): AuditIssue[] {
  const issues: AuditIssue[] = []
  const children = new Map<string, MapNode[]>()
  for (const n of map.nodes) if (n.parent) children.set(n.parent, [...(children.get(n.parent) ?? []), n])
  const named = (n: MapNode): boolean => !!n.text?.trim() || (children.get(n.n) ?? []).some(named)

  // A row scrolled half out of view is cut off at the content's top or bottom edge: its visible
  // size says nothing about its real size.
  const top = map.content.y + 0.5
  const bottom = map.content.y + map.content.h - 0.5
  const cutOff = (n: MapNode): boolean => n.y <= top || n.y + n.h >= bottom
  for (const n of map.nodes) {
    if (isPressable(n) && !(cutOff(n) && n.h < MIN_TARGET_DP)) {
      if (n.w < MIN_TARGET_DP || n.h < MIN_TARGET_DP)
        issues.push({ kind: 'target', n: n.n, severity: 'warning', message: `Touch target ${n.w}×${n.h} dp, under ${MIN_TARGET_DP}×${MIN_TARGET_DP}` })
      if (!named(n)) issues.push({ kind: 'label', n: n.n, severity: 'error', message: `Pressable ${n.kind} with no label: screen readers can’t name it` })
    }
    const size = sp(n.textSize)
    if (n.text?.trim() && size !== null && size < MIN_TEXT_SP)
      issues.push({ kind: 'text-size', n: n.n, severity: 'warning', message: `Text at ${size} sp, under ${MIN_TEXT_SP} sp` })
    if (n.text?.trim() && n.foreground && n.background && n.textSize) {
      const ratio = contrastRatio(n.foreground, n.background)
      const large = (size ?? 0) >= 18
      const need = large ? 3 : 4.5
      if (ratio !== null && ratio < need)
        issues.push({
          kind: 'contrast',
          n: n.n,
          severity: ratio < 3 ? 'error' : 'warning',
          message: `Contrast ${ratio.toFixed(1)}:1 (${n.foreground} on ${n.background}), needs ${need}:1`,
        })
    }
  }
  const order: AuditKind[] = ['label', 'contrast', 'target', 'text-size']
  return issues.sort((a, b) => (a.severity === b.severity ? order.indexOf(a.kind) - order.indexOf(b.kind) : a.severity === 'error' ? -1 : 1))
}
