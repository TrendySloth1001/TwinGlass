import { describe, expect, it } from 'vitest'
import { nodeAt, spacing } from '../src/renderer/src/lib/inspect'

const box = (l: number, t: number, r: number, b: number) => ({ px: [l, t, r, b] as [number, number, number, number] })

describe('inspect geometry', () => {
  it('picks the smallest element under the pointer', () => {
    const page = box(0, 0, 1080, 2400)
    const card = box(40, 400, 1040, 800)
    const label = box(80, 440, 400, 500)
    expect(nodeAt([page, card, label], 100, 450)).toBe(label)
    expect(nodeAt([page, card, label], 900, 700)).toBe(card)
    expect(nodeAt([card], 10, 10)).toBeNull()
  })

  it('measures gaps between siblings and insets inside a parent, in dp', () => {
    // density 3: 48 px = 16 dp
    expect(spacing(box(0, 0, 300, 100), box(348, 0, 600, 100), 3)).toEqual({ h: 16, v: 0 })
    expect(spacing(box(0, 0, 300, 100), box(0, 124, 300, 200), 3)).toEqual({ h: 0, v: 8 })
    expect(spacing(box(0, 0, 900, 300), box(48, 24, 852, 276), 3)).toEqual({ h: 0, v: 0, inside: [16, 8, 16, 8] })
  })
})
