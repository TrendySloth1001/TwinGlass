import { describe, expect, it } from 'vitest'
import { buildScreenMap, sampleColors } from '../src/main/agent/screen-map'

// 1080×2400 at 420 dpi: density 2.625 (1 dp = 2.625 px).
const display = { width: 1080, height: 2400, dpi: 420 }
const D = 2.625
const px = (v: number): number => Math.round(v * D)

const raw = {
  windows: [
    { index: 0, type: 3, title: 'Status', pkg: 'com.android.systemui', b: [0, 0, 1080, px(24)] },
    { index: 1, type: 1, title: 'App', pkg: 'com.example', b: [0, 0, 1080, 2400] },
    { index: 2, type: 3, title: 'Nav', pkg: 'com.android.systemui', b: [0, 2400 - px(48), 1080, 2400] },
  ],
  nodes: [
    { ref: '0.0', d: 1, cls: 'TextView', text: '12:00', pkg: 'com.android.systemui', b: [px(16), 0, px(60), px(24)] },
    { ref: '1', d: 0, cls: 'FrameLayout', pkg: 'com.example', b: [0, 0, 1080, 2400], children: 1, lw: -1, lh: -1 },
    { ref: '1.0', d: 1, cls: 'LinearLayout', pkg: 'com.example', id: 'com.example:id/list', b: [0, px(24), 1080, 2400 - px(48)], children: 3, lw: -1, lh: -1 },
    { ref: '1.0.0', d: 2, cls: 'TextView', text: 'Title', pkg: 'com.example', b: [px(16), px(40), px(200), px(68)], lw: -2, lh: -2, tpx: 22 * D, tunit: 2 },
    { ref: '1.0.1', d: 2, cls: 'Button', text: 'OK', pkg: 'com.example', f: 'click', b: [px(16), px(84), px(116), px(132)], lw: px(100), lh: px(48), tpx: 14 * D, tunit: 2 },
    { ref: '1.0.2', d: 2, cls: 'Button', text: 'Cancel', pkg: 'com.example', f: 'click', b: [px(16), px(140), px(116), px(188)], lw: px(100), lh: px(48), tpx: 14 * D, tunit: 2 },
  ],
}

describe('screen map', () => {
  const m = buildScreenMap(raw, display, { agent: { width: 576, height: 1280 } })
  it('reports the display in dp and the system bars', () => {
    expect(m.display).toMatchObject({ density: 2.625, widthDp: 411.5, heightDp: 914.3 }) // 2400 / 2.625 = 914.29
    expect(m.statusBar?.heightDp).toBe(24)
    expect(m.navigationBar).toEqual({ heightDp: 48, position: 'bottom' })
    expect(m.content).toEqual({ x: 0, y: 24, w: 411.5, h: 842.3 })
  })
  it('gives dp boxes, layout params, text sizes, parents, insets and gaps', () => {
    expect(m.nodes.some((n) => n.app === 'com.android.systemui')).toBe(false) // system UI left out by default
    const ok = m.nodes.find((n) => n.text === 'OK')!
    expect(ok).toMatchObject({ x: 16, y: 84, w: 100, h: 48, layout: { width: 100, height: 48 }, textSize: '14sp', flags: 'click' })
    const list = m.nodes.find((n) => n.id === 'list')!
    expect(ok.parent).toBe(list.n)
    expect(ok.inset).toEqual([16, 60, 295, 734]) // from exact pixels (775 px right, 1927 px below)
    const title = m.nodes.find((n) => n.text === 'Title')!
    expect(title.layout).toEqual({ width: 'wrap_content', height: 'wrap_content' })
    expect(title.textSize).toBe('22sp')
    expect(ok.gap).toEqual({ after: title.n, dp: 16, axis: 'vertical' })
    expect(m.nodes.find((n) => n.text === 'Cancel')!.gap?.dp).toBe(8)
    expect(ok.tap).toEqual([93, 151]) // centre (173.5, 284) px × 576/1080
  })
  it('summarises the type scale, spacing and keylines', () => {
    expect(m.summary.textSizes[0]).toEqual({ size: '14sp', count: 2, examples: ['OK', 'Cancel'] })
    expect(m.summary.spacing).toEqual(expect.arrayContaining([{ dp: 16, count: 1 }, { dp: 8, count: 1 }]))
    expect(m.summary.keylines[0]).toEqual({ xDp: 16, count: 3 })
  })
  it('can include system UI or a single app', () => {
    expect(buildScreenMap(raw, display, { includeSystem: true }).nodes.some((n) => n.text === '12:00')).toBe(true)
    expect(buildScreenMap(raw, display, { app: 'com.android.systemui' }).nodes.map((n) => n.text)).toEqual(['12:00'])
  })
  it('compact drops wrapper-only views', () => {
    const full = buildScreenMap(raw, display, {})
    const compact = buildScreenMap(raw, display, { compact: true })
    expect(compact.nodes.length).toBeLessThanOrEqual(full.nodes.length)
    expect(compact.nodes.some((n) => n.text === 'OK')).toBe(true)
  })
})

describe('colours', () => {
  it('finds background and text colour', () => {
    // 108×240 frame (1/10 scale): white page, a blue button with white text in the middle.
    const w = 108
    const h = 240
    const bgra = new Uint8Array(w * h * 4)
    const put = (x: number, y: number, [r, g, b]: number[]): void => {
      const i = (y * w + x) * 4
      bgra[i] = b!
      bgra[i + 1] = g!
      bgra[i + 2] = r!
      bgra[i + 3] = 255
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(x, y, [255, 255, 255])
    for (let y = 100; y < 140; y++) for (let x = 20; x < 88; x++) put(x, y, [26, 115, 232])
    for (let y = 115; y < 125; y++) for (let x = 40; x < 68; x++) put(x, y, [255, 255, 255])
    const m = buildScreenMap(
      { windows: [{ index: 0, type: 1, title: '', pkg: 'a', b: [0, 0, 1080, 2400] }], nodes: [{ ref: '0', d: 0, cls: 'Button', text: 'Go', pkg: 'a', b: [200, 1000, 880, 1400] }] },
      display,
    )
    const palette = sampleColors(bgra, w, h, display, m.nodes)
    expect(m.nodes[0]!.background).toBe('#1a73e8')
    expect(m.nodes[0]!.foreground).toBe('#ffffff')
    expect(palette[0]!.hex).toBe('#1a73e8')
  })
})

describe('nice values', () => {
  it('recovers what the app declared from rounded pixels', async () => {
    const { nice } = await import('../src/main/agent/screen-map')
    expect(nice(47, 2.625)).toBe(18) // 18sp = 47.25 px, rounded to 47
    expect(nice(137, 2.625, 1)).toBe(52) // 52 dp = 136.5 px
    expect(nice(42, 2.625)).toBe(16)
    expect(nice(64, 2.625, 1)).toBe(24) // 24.38: 24 dp = 63 px is within ±1 px
    expect(nice(80, 2.625, 0.5)).toBe(30.5) // 30.48: no whole number fits ±0.5 px, a half does
    expect(nice(56, 3.5, 0.5)).toBe(16)
  })
  it('uses the font scale for sp', () => {
    const m = buildScreenMap(
      { windows: [{ index: 0, type: 1, title: '', pkg: 'a', b: [0, 0, 1080, 2400] }], nodes: [{ ref: '0', d: 0, cls: 'TextView', text: 'x', pkg: 'a', b: [0, 0, 100, 60], tpx: 16 * 2.625 * 1.3, tunit: 2 }] },
      { ...display, fontScale: 1.3 },
    )
    expect(m.nodes[0]!.textSize).toBe('16sp')
  })
})
