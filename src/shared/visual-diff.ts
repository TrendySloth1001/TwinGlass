// Visual baselines (pure, unit-tested): how much of a screen changed against its saved baseline.
// Works on raw 4-byte pixels (RGBA or BGRA, both images the same) of the same size.

export interface PixelDiff {
  /** Pixels that differ by more than the tolerance in any channel. */
  changed: number
  /** Pixels compared (the status bar band is left out). */
  compared: number
  /** changed / compared × 100, one decimal. */
  percent: number
}

/** Per-channel difference treated as the same (JPEG noise, anti-aliasing). */
export const DIFF_TOLERANCE = 40
/** Above this share of changed pixels a screen counts as changed. */
export const CHANGED_PERCENT = 0.5
/** The top of the screen holding the clock and battery: it changes every run, so it's skipped. */
export const STATUS_BAR_SHARE = 0.04

export function diffPixels(a: Uint8Array, b: Uint8Array, width: number, height: number, skipTopRows = Math.round(height * STATUS_BAR_SHARE), tolerance = DIFF_TOLERANCE): PixelDiff {
  if (a.length !== width * height * 4 || b.length !== a.length) throw new Error('Both images must be the same size.')
  let changed = 0
  const start = Math.min(Math.max(skipTopRows, 0), height) * width * 4
  for (let i = start; i < a.length; i += 4) {
    if (Math.abs(a[i]! - b[i]!) > tolerance || Math.abs(a[i + 1]! - b[i + 1]!) > tolerance || Math.abs(a[i + 2]! - b[i + 2]!) > tolerance) changed++
  }
  const compared = (a.length - start) / 4
  return { changed, compared, percent: compared ? Math.round((changed / compared) * 1000) / 10 : 0 }
}

/** The conditions a test matrix can run under. Each one is applied with set_device_state, then reset. */
export const MATRIX_CONDITIONS = [
  { id: 'light', label: 'Light', state: { dark_mode: false } },
  { id: 'dark', label: 'Dark', state: { dark_mode: true } },
  { id: 'large-text', label: 'Large text (1.3×)', state: { font_scale: 1.3 } },
  { id: 'dark-large-text', label: 'Dark + large text', state: { dark_mode: true, font_scale: 1.3 } },
] as const

export type MatrixConditionId = (typeof MATRIX_CONDITIONS)[number]['id']

export interface MatrixCell {
  condition: MatrixConditionId
  label: string
  /** 'failed': a step failed. 'new': passed, no baseline yet. 'same' / 'changed': against the baseline. */
  status: 'failed' | 'new' | 'same' | 'changed'
  steps: number
  message?: string
  /** The screen at the end (or where it failed), JPEG data URL. */
  screenshot?: string
  baseline?: string
  diffPercent?: number
}
