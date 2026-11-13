import { describe, expect, it } from 'vitest'
import { auditScreen, contrastRatio } from '../src/shared/a11y-audit'
import type { MapNode, ScreenMap } from '../src/main/agent/screen-map'

const node = (n: string, o: Partial<MapNode>): MapNode => ({ n, depth: 1, kind: 'View', app: 'a', x: 0, y: 100, w: 100, h: 100, px: [0, 0, 1, 1], ref: n, ...o })
const map = (nodes: MapNode[]): ScreenMap => ({
  display: { widthPx: 1080, heightPx: 2400, dpi: 480, density: 3, fontScale: 1, widthDp: 360, heightDp: 800 },
  content: { x: 0, y: 0, w: 360, h: 800 },
  nodes,
  summary: { textSizes: [], spacing: [], keylines: [], repeated: [] },
  truncated: false,
})

describe('contrastRatio', () => {
  it('matches WCAG for black on white and equal colours', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0)
    expect(contrastRatio('#777777', '#777777')).toBe(1)
  })
})

describe('auditScreen', () => {
  it('flags small and unnamed pressable elements, low contrast and tiny text', () => {
    const issues = auditScreen(
      map([
        node('n1', { kind: 'ImageButton', flags: 'click', w: 32, h: 32 }), // small, no label
        node('n2', { kind: 'LinearLayout', flags: 'click', w: 360, h: 56 }), // labelled by its child
        node('n3', { parent: 'n2', kind: 'TextView', text: 'Settings', textSize: '16sp', foreground: '#f2f2f2', background: '#1f1f1f' }),
        node('n4', { kind: 'TextView', text: 'Faint', textSize: '14sp', foreground: '#888888', background: '#999999' }),
        node('n5', { kind: 'TextView', text: 'Legal', textSize: '10sp', foreground: '#000000', background: '#ffffff' }),
      ]),
    )
    const got = issues.map((i) => `${i.kind}:${i.n}:${i.severity}`)
    expect(got).toEqual(['label:n1:error', 'contrast:n4:error', 'target:n1:warning', 'text-size:n5:warning'])
  })

  it('skips rows cut off by the edge of the scrolled content', () => {
    // content ends at y = 800; a pressable row 2 dp tall sits at its very bottom
    expect(auditScreen(map([node('r', { flags: 'click', y: 798, h: 2, w: 360 })]))).toEqual([])
  })

  it('accepts large text at 3:1 and passes a clean screen', () => {
    expect(auditScreen(map([node('t', { text: 'Big', textSize: '24sp', foreground: '#767676', background: '#ffffff' })]))).toEqual([])
  })
})
