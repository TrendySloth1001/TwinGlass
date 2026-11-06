// Video quality presets. max_size caps the longest side (0 = native); bitrates in bits/s.
// USB has plenty of bandwidth (measured jitter 5–11 ms at native 8 Mbps); Wi-Fi is the
// constraint (10–24 ms jitter at 4 Mbps), so its presets are lower.

export type Quality = 'auto' | 'max' | 'high' | 'balanced' | 'smooth'
export type CodecPreference = 'auto' | 'h264' | 'h265'

export interface VideoParams {
  maxSize: number
  videoBitRate: number
}

const TABLE: Record<Exclude<Quality, 'auto'>, Record<'usb' | 'wifi', VideoParams>> = {
  max: { usb: { maxSize: 0, videoBitRate: 24_000_000 }, wifi: { maxSize: 0, videoBitRate: 16_000_000 } },
  high: { usb: { maxSize: 0, videoBitRate: 16_000_000 }, wifi: { maxSize: 1920, videoBitRate: 10_000_000 } },
  balanced: { usb: { maxSize: 1600, videoBitRate: 8_000_000 }, wifi: { maxSize: 1600, videoBitRate: 6_000_000 } },
  smooth: { usb: { maxSize: 1024, videoBitRate: 4_000_000 }, wifi: { maxSize: 1024, videoBitRate: 3_000_000 } },
}

/** "auto": High on USB, Balanced on Wi-Fi. */
export function videoParams(quality: Quality, kind: 'usb' | 'wifi'): VideoParams {
  const q = quality === 'auto' ? (kind === 'usb' ? 'high' : 'balanced') : quality
  return TABLE[q][kind]
}

export const QUALITY_LABELS: Record<Quality, string> = {
  auto: 'Auto (High on USB, Balanced on Wi-Fi)',
  max: 'Maximum: native resolution, highest bitrate',
  high: 'High: native on USB, 1920 px on Wi-Fi',
  balanced: 'Balanced: 1600 px',
  smooth: 'Smooth: 1024 px, lowest latency',
}

/** Sizes the phone actually encodes are multiples of 8 (scrcpy aligns them); describe the cap. */
export function describeParams(p: VideoParams): string {
  return `${p.maxSize ? `${p.maxSize} px` : 'native'} · ${(p.videoBitRate / 1e6).toFixed(0)} Mbps`
}
