// Phone frames drawn around the mirror (Settings → Window → Phone frame). Generic designs, not
// copies of any brand's phone. All sizes are CSS px so the compact window can add exactly the
// frame's thickness around the video (see window-layout.ts extra size).

export type FrameStyle = 'none' | 'modern' | 'minimal' | 'classic'
export type FrameColor = 'black' | 'graphite' | 'silver' | 'white' | 'sand' | 'blue' | 'green'

export interface FrameSpec {
  style: Exclude<FrameStyle, 'none'>
  /** Metal rim thickness (the coloured edge). */
  rim: number
  /** Black glass around the screen, inside the rim: left/right, top, bottom. */
  side: number
  top: number
  bottom: number
  /** Screen corner radius as a fraction of the screen width. */
  screenRadius: number
  /** Punch-hole camera in the screen (top centre). */
  punchHole: boolean
  /** Side buttons sticking out of the right edge (px). */
  buttons: number
}

export const FRAMES: Record<Exclude<FrameStyle, 'none'>, FrameSpec> = {
  modern: { style: 'modern', rim: 3, side: 7, top: 7, bottom: 7, screenRadius: 0.085, punchHole: true, buttons: 3 },
  minimal: { style: 'minimal', rim: 2, side: 4, top: 4, bottom: 4, screenRadius: 0.06, punchHole: false, buttons: 3 },
  classic: { style: 'classic', rim: 3, side: 10, top: 48, bottom: 52, screenRadius: 0.015, punchHole: false, buttons: 3 },
}

export const FRAME_LABELS: Record<FrameStyle, { label: string; hint: string }> = {
  none: { label: 'None', hint: 'Just the screen' },
  modern: { label: 'Modern', hint: 'Thin bezel, punch-hole camera' },
  minimal: { label: 'Minimal', hint: 'Thinnest bezel' },
  classic: { label: 'Classic', hint: 'Speaker and home button' },
}

/** Rim gradient [light, dark] per finish. */
export const FRAME_COLORS: Record<FrameColor, { label: string; light: string; dark: string }> = {
  black: { label: 'Black', light: '#3a3a3c', dark: '#0d0d0e' },
  graphite: { label: 'Graphite', light: '#5d6066', dark: '#2a2c30' },
  silver: { label: 'Silver', light: '#eceef1', dark: '#9fa3aa' },
  white: { label: 'White', light: '#ffffff', dark: '#d6d6d3' },
  sand: { label: 'Sand', light: '#ead8bd', dark: '#b39874' },
  blue: { label: 'Blue', light: '#5b7ea8', dark: '#22344d' },
  green: { label: 'Green', light: '#7c9a84', dark: '#334a3b' },
}

export function frameSpec(style: FrameStyle): FrameSpec | null {
  return style === 'none' ? null : FRAMES[style]
}

/** Total frame thickness around the video: what the compact window adds to the video size. */
export function frameExtra(spec: FrameSpec | null): { width: number; height: number } {
  if (!spec) return { width: 0, height: 0 }
  return {
    width: 2 * (spec.rim + spec.side) + spec.buttons,
    height: 2 * spec.rim + spec.top + spec.bottom,
  }
}
