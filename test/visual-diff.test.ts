import { describe, expect, it } from 'vitest'
import { diffPixels } from '../src/shared/visual-diff'

const img = (w: number, h: number, fill: number): Uint8Array => new Uint8Array(w * h * 4).fill(fill)

describe('visual baselines: pixel difference', () => {
  it('counts pixels beyond the tolerance, skipping the status bar rows', () => {
    const a = img(10, 10, 100)
    const b = img(10, 10, 100)
    // Row 0 (status bar, skipped) fully changed; rows 5 and 6 changed in pixels 0..4.
    for (let x = 0; x < 10; x++) b[x * 4] = 255
    for (const y of [5, 6]) for (let x = 0; x < 5; x++) b[(y * 10 + x) * 4 + 1] = 0
    const d = diffPixels(a, b, 10, 10, 1, 40)
    expect(d.compared).toBe(90)
    expect(d.changed).toBe(10)
    expect(d.percent).toBe(11.1)
  })
  it('treats small differences (JPEG noise) as the same', () => {
    const b = img(4, 4, 120)
    expect(diffPixels(img(4, 4, 100), b, 4, 4, 0, 40).changed).toBe(0)
    expect(diffPixels(img(4, 4, 100), img(4, 4, 141), 4, 4, 0, 40).changed).toBe(16)
  })
  it('rejects images of different sizes', () => {
    expect(() => diffPixels(img(2, 2, 0), img(2, 3, 0), 2, 2)).toThrow()
  })
})
