// Agent coordinate space (pure, unit-tested).
//
// Agents see screenshots scaled so the longest side is AGENT_MAX_DIM px, and give tap/swipe
// coordinates in that same space. We map them to whatever the injection path needs: the live
// mirror's video size (scrcpy control socket) or device pixels (`adb shell input`).

export const AGENT_MAX_DIM = 1280

export interface Size {
  width: number
  height: number
}

export interface Point {
  x: number
  y: number
}

/** Size of the agent-facing image for a screen of `screen` pixels (never upscales). */
export function agentSpace(screen: Size, maxDim = AGENT_MAX_DIM): Size {
  const scale = Math.min(1, maxDim / Math.max(screen.width, screen.height))
  return { width: Math.round(screen.width * scale), height: Math.round(screen.height * scale) }
}

/** Maps a point between two pixel spaces of the same screen, clamped inside the target. */
export function mapPoint(p: Point, from: Size, to: Size): Point {
  const clamp = (v: number, max: number): number => Math.min(Math.max(Math.round(v), 0), max - 1)
  return { x: clamp((p.x / from.width) * to.width, to.width), y: clamp((p.y / from.height) * to.height, to.height) }
}

/** Validates agent-supplied coordinates against the agent space. */
export function checkPoint(p: Point, space: Size): string | null {
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return 'coordinates must be numbers'
  if (p.x < 0 || p.y < 0 || p.x >= space.width || p.y >= space.height) {
    return `(${p.x}, ${p.y}) is outside the screen (${space.width}×${space.height}); use coordinates from the latest screenshot`
  }
  return null
}
