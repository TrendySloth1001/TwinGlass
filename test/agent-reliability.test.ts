import { describe, expect, it } from 'vitest'
import { clickableAround, fieldText, matchNodes, parseA11yTree, sameFieldText, screenSignature, type UiNode } from '../src/main/agent/ui-tree'

const size = { width: 1000, height: 2000 }
const tree = (nodes: Record<string, unknown>[]): UiNode[] => parseA11yTree({ nodes }, size, size)

describe('agent element tools', () => {
  // Google's Backup screen: the clickable row has no text; its label is a child.
  const nodes = tree([
    { ref: '0.2', text: '', desc: '', inner: 'Back up now · Last backup 2 h ago', cls: 'LinearLayout', b: [0, 400, 1000, 560], f: 'click' },
    { ref: '0.2.0', text: 'Back up now', desc: '', cls: 'TextView', b: [40, 420, 600, 480], f: '' },
    { ref: '0.2.1', text: 'Last backup 2 h ago', desc: '', cls: 'TextView', b: [40, 490, 600, 540], f: '' },
    { ref: '0.3', text: 'Search settings', hint: 'Search settings', desc: '', cls: 'EditText', b: [0, 100, 1000, 200], f: 'click,edit' },
  ])

  it('names a clickable row without text by the text inside it', () => {
    expect(nodes[0]!.label).toBe('Back up now · Last backup 2 h ago')
    expect(matchNodes(nodes, { text: 'Back up now' }).map((n) => n.ref)).toEqual(['0.2', '0.2.0'])
  })

  it('presses the row around a plain label (by ref path, else by bounds)', () => {
    expect(clickableAround(nodes, nodes[1]!)?.ref).toBe('0.2')
    const noRef = { ...nodes[2]!, ref: undefined }
    expect(clickableAround(nodes, noRef)?.ref).toBe('0.2')
    expect(clickableAround(nodes, nodes[0]!)?.ref).toBe('0.2')
  })

  it('reads a field back without its placeholder and compares loosely', () => {
    expect(fieldText(nodes[3]!)).toBe('') // the hint reported as text = empty
    expect(sameFieldText('+1 555-0100', '15550100')).toBe(true)
    expect(sameFieldText('syncsync', 'sync')).toBe(false)
    expect(sameFieldText('Café', 'café')).toBe(true)
  })

  it('tells whether the screen moved', () => {
    const moved = nodes.map((n) => ({ ...n, bounds: [n.bounds[0], n.bounds[1] - 300, n.bounds[2], n.bounds[3] - 300] as UiNode['bounds'] }))
    expect(screenSignature(nodes)).toBe(screenSignature(tree([...nodes.map((n) => ({ ref: n.ref, text: n.label, hint: n.hint, b: n.bounds, f: n.clickable ? 'click' : '' }))])))
    expect(screenSignature(moved)).not.toBe(screenSignature(nodes))
  })
})
