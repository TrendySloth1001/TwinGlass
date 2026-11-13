import { describe, expect, it } from 'vitest'
import { compareDesign, figmaFrame, parseFigmaUrl } from '../src/main/agent/design-qa'
import type { MapNode, ScreenMap } from '../src/main/agent/screen-map'

describe('parseFigmaUrl', () => {
  it('reads file key and node id from design, file and branch links', () => {
    expect(parseFigmaUrl('https://www.figma.com/design/AbC123/My-App?node-id=12-34&t=x')).toEqual({ fileKey: 'AbC123', nodeId: '12:34' })
    expect(parseFigmaUrl('https://figma.com/file/KEY/Name?node-id=1%3A2')).toEqual({ fileKey: 'KEY', nodeId: '1:2' })
    expect(parseFigmaUrl('https://www.figma.com/design/MAIN/branch/BR4NCH/App?node-id=5-6')).toEqual({ fileKey: 'BR4NCH', nodeId: '5:6' })
    expect(parseFigmaUrl('https://www.figma.com/design/KEY/App')).toBeNull()
    expect(parseFigmaUrl('https://evil.example/design/KEY/App?node-id=1-2')).toBeNull()
  })
})

const frameDoc = {
  name: 'Login',
  absoluteBoundingBox: { x: 1000, y: 500, width: 360, height: 800 },
  children: [
    { type: 'TEXT', name: 'Title', characters: 'Welcome back', absoluteBoundingBox: { x: 1024, y: 600, width: 200, height: 32 }, style: { fontSize: 24 }, fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }] },
    { type: 'TEXT', name: 'Button', characters: 'Sign in', absoluteBoundingBox: { x: 1024, y: 1100, width: 312, height: 20 }, style: { fontSize: 16 } },
    { type: 'TEXT', name: 'Hidden', visible: false, characters: 'Secret', absoluteBoundingBox: { x: 0, y: 0, width: 1, height: 1 } },
    { type: 'TEXT', name: 'Help', characters: 'Forgot password?', absoluteBoundingBox: { x: 1024, y: 1200, width: 120, height: 18 }, style: { fontSize: 14 } },
  ],
}

const node = (text: string, x: number, y: number, w: number, o: Partial<MapNode> = {}): MapNode => ({ n: text, depth: 1, kind: 'TextView', text, app: 'a', x, y, w, h: 20, px: [0, 0, 0, 0], ref: text, ...o })
const map = (nodes: MapNode[]): ScreenMap => ({
  display: { widthPx: 1080, heightPx: 2400, dpi: 480, density: 3, fontScale: 1, widthDp: 360, heightDp: 800 },
  content: { x: 0, y: 24, w: 360, h: 776 },
  nodes,
  summary: { textSizes: [], spacing: [], keylines: [] , repeated: [] },
  truncated: false,
})

describe('figmaFrame', () => {
  it('collects visible texts relative to the frame, with font size and colour', () => {
    const f = figmaFrame(frameDoc)!
    expect(f.width).toBe(360)
    expect(f.texts.map((t) => t.text)).toEqual(['Welcome back', 'Sign in', 'Forgot password?'])
    expect(f.texts[0]).toMatchObject({ x: 24, y: 100, fontSize: 24, color: '#000000' })
  })
})

describe('compareDesign', () => {
  it('lines the screen up with the design (status bar / scroll offset) and reports only real differences', () => {
    const f = figmaFrame(frameDoc)!
    // Everything sits 24 dp lower on the phone (status bar); "Sign in" is also 6 dp further down,
    // its title is 22 sp instead of 24, "Forgot password?" is missing and "Skip" isn't in the design.
    const r = compareDesign(
      f,
      map([
        node('Welcome back', 24, 124, 200, { textSize: '22sp', foreground: '#000000' }),
        node('Sign in', 24, 630, 312, { textSize: '16sp' }),
        node('Skip', 300, 40, 40),
      ]),
    )
    expect(r.offset).toEqual({ dx: 0, dy: 27 })
    expect(r.matched).toBe(2)
    const kinds = r.issues.map((i) => `${i.kind}:${i.text}`)
    expect(kinds).toContain('missing:Forgot password?')
    expect(kinds).toContain('extra:Skip')
    expect(kinds).toContain('font:Welcome back')
    expect(r.issues.find((i) => i.kind === 'font')).toMatchObject({ design: '24 sp', screen: '22 sp', delta: -2 })
  })

  it('scales a frame drawn at another width', () => {
    const f = { name: 'x2', width: 720, height: 1600, texts: [{ text: 'Hi', name: 'Hi', x: 48, y: 200, w: 100, h: 40, fontSize: 32 }] }
    const r = compareDesign(f, map([node('Hi', 24, 100, 50, { textSize: '16sp' })]))
    expect(r.scale).toBe(2)
    expect(r.issues).toEqual([])
  })

  it('ignores containers labelled with a title and icon descriptions', () => {
    const f = { name: 't', width: 360, height: 800, texts: [{ text: 'Battery', name: 'title', x: 28, y: 100, w: 90, h: 30, fontSize: 24 }] }
    const r = compareDesign(
      f,
      map([
        node('Battery', 0, 61, 411.5, { kind: 'FrameLayout' }), // the toolbar, labelled with its title
        node('Battery', 28, 100, 90, { kind: 'TextView', textSize: '24sp' }),
        node('Navigate up', 8, 61, 48, { kind: 'ImageButton' }),
      ]),
    )
    expect(r.issues).toEqual([])
    expect(r.matched).toBe(1)
  })

  it('flags a text colour that is clearly different', () => {
    const f = { name: 'c', width: 360, height: 800, texts: [{ text: 'Error', name: 'e', x: 10, y: 10, w: 50, h: 20, color: '#D32F2F' }] }
    const r = compareDesign(f, map([node('Error', 10, 10, 50, { foreground: '#1F1F1F' })]))
    expect(r.issues).toEqual([{ kind: 'color', text: 'Error', design: '#D32F2F', screen: '#1F1F1F' }])
  })
})
