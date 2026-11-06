// Map a pointer position on the rendered element to device video coordinates,
// accounting for letterboxing when the video is drawn with "contain" scaling.
import type { Size } from '../scrcpy/control'

export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

/** Returns null when the point falls in the letterbox bars. */
export function clientToVideo(clientX: number, clientY: number, rect: Rect, video: Size): { x: number; y: number } | null {
  const scale = Math.min(rect.width / video.width, rect.height / video.height)
  const drawnW = video.width * scale
  const drawnH = video.height * scale
  const offX = rect.left + (rect.width - drawnW) / 2
  const offY = rect.top + (rect.height - drawnH) / 2
  const x = (clientX - offX) / scale
  const y = (clientY - offY) / scale
  if (x < 0 || y < 0 || x >= video.width || y >= video.height) return null
  return { x: Math.floor(x), y: Math.floor(y) }
}

/** Like clientToVideo but clamps to the frame (use while a drag is in progress). */
export function clientToVideoClamped(clientX: number, clientY: number, rect: Rect, video: Size): { x: number; y: number } {
  const scale = Math.min(rect.width / video.width, rect.height / video.height)
  const offX = rect.left + (rect.width - video.width * scale) / 2
  const offY = rect.top + (rect.height - video.height * scale) / 2
  const clamp = (v: number, max: number): number => Math.min(Math.max(Math.floor(v), 0), max - 1)
  return { x: clamp((clientX - offX) / scale, video.width), y: clamp((clientY - offY) / scale, video.height) }
}
