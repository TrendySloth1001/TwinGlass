import { describe, expect, it } from 'vitest'
import { clientToVideo, videoToClient } from '@shared/input/coords'
import { initialPinchDistance, nextPinchDistance, pinchPair, virtualFinger } from '@shared/input/gestures'

const size = { width: 576, height: 1280 }

describe('virtualFinger (scrcpy input_manager.c semantics)', () => {
  it('pinch mirrors through the centre', () => {
    expect(virtualFinger({ x: 100, y: 200 }, size, 'pinch')).toEqual({ x: 476, y: 1080 })
  })
  it('tilt mirrors across the vertical axis only', () => {
    expect(virtualFinger({ x: 100, y: 200 }, size, 'tilt')).toEqual({ x: 476, y: 200 })
  })
})

describe('trackpad pinch', () => {
  it('places two fingers around the cursor, inside the frame', () => {
    expect(pinchPair({ x: 288, y: 640 }, 100, size)).toEqual([
      { x: 238, y: 640 },
      { x: 338, y: 640 },
    ])
    const [a, b] = pinchPair({ x: 5, y: 2000 }, 100, size)
    expect(a).toEqual({ x: 0, y: 1279 })
    expect(b.x).toBe(55)
  })
  it('spreads on negative deltaY (zoom in) and stays within bounds', () => {
    const d0 = initialPinchDistance(size)
    expect(d0).toBe(144)
    expect(nextPinchDistance(d0, -10, size)).toBeGreaterThan(d0)
    expect(nextPinchDistance(d0, 10, size)).toBeLessThan(d0)
    expect(nextPinchDistance(d0, -100000, size)).toBeCloseTo(576 * 0.9)
    expect(nextPinchDistance(d0, 100000, size)).toBe(24)
  })
})

describe('coordinate round trip (precision)', () => {
  // Window stage 900x700 CSS px showing a 576x1280 stream: letterboxed horizontally.
  const rect = { left: 260, top: 48, width: 900, height: 700 }
  it('every sampled video pixel maps back to itself', () => {
    for (const [x, y] of [
      [0, 0],
      [575, 1279],
      [288, 640],
      [17, 1001],
      [431, 3],
    ] as const) {
      const c = videoToClient(x, y, rect, size)
      expect(clientToVideo(c.x, c.y, rect, size)).toEqual({ x, y })
    }
  })
})
