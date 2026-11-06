// Multi-touch geometry (pure, unit-tested). The scrcpy server turns a second pointer's DOWN/UP into
// ACTION_POINTER_DOWN/UP itself (Controller.injectTouch), so the client only tracks positions.
import type { Size } from '../scrcpy/control'

export interface Point {
  x: number
  y: number
}

export type MirrorMode = 'pinch' | 'tilt'

/**
 * Position of the "virtual finger" for a mouse drag, as in scrcpy's input_manager.c:
 * - pinch: mirrored through the screen centre (invert x and y): drag away from / towards the centre
 *   to zoom in / out, circle around it to rotate.
 * - tilt: mirrored across the vertical axis (invert x): both fingers move vertically together
 *   (two-finger swipe / map tilt).
 */
export function virtualFinger(p: Point, size: Size, mode: MirrorMode): Point {
  return mode === 'pinch' ? { x: size.width - p.x, y: size.height - p.y } : { x: size.width - p.x, y: p.y }
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi)

/** Two finger positions `distance` apart (horizontally) around `center`, kept inside the frame. */
export function pinchPair(center: Point, distance: number, size: Size): [Point, Point] {
  const half = distance / 2
  const y = clamp(Math.round(center.y), 0, size.height - 1)
  return [
    { x: clamp(Math.round(center.x - half), 0, size.width - 1), y },
    { x: clamp(Math.round(center.x + half), 0, size.width - 1), y },
  ]
}

/** Trackpad pinch arrives as ctrl+wheel; negative deltaY = fingers spreading = zoom in. */
export function nextPinchDistance(distance: number, deltaY: number, size: Size): number {
  const min = 24
  const max = Math.min(size.width, size.height) * 0.9
  return clamp(distance * Math.exp(-deltaY * 0.01), min, max)
}

export function initialPinchDistance(size: Size): number {
  return Math.round(Math.min(size.width, size.height) * 0.25)
}
