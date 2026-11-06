// Message shapes on the per-session MessagePort (main <-> renderer).
import type { DeviceMessage } from './scrcpy/device-messages'
import type { StreamEvent } from './scrcpy/stream'

export type AudioMode = 'off' | 'mac' | 'both'

export interface StartSessionRequest {
  serial: string
  maxSize?: number
  videoBitRate?: number
  maxFps?: number
  audio?: AudioMode
  /** Phone draws a dot where each touch lands (scrcpy show_touches; restored on disconnect). */
  showTouches?: boolean
}

export interface FileResult {
  name: string
  ok: boolean
  message: string
}

export type MainToRenderer =
  /** `at`: epoch ms (performance.timeOrigin + now) when main received the packet, for latency stats. */
  | { t: 'video'; ev: StreamEvent; at: number }
  | { t: 'audio'; ev: StreamEvent }
  | { t: 'device'; msg: DeviceMessage }
  | { t: 'log'; line: string }
  | { t: 'closed'; error?: string }

export type RendererToMain = { t: 'control'; data: Uint8Array } | { t: 'stop' }

/** Quality presets (docs/FACTS.md): Wi-Fi gets a lower bitrate and resolution. */
export const QualityPreset = {
  usb: { videoBitRate: 8_000_000, maxSize: 0 },
  wifi: { videoBitRate: 4_000_000, maxSize: 1280 },
} as const
