// Message shapes on the per-session MessagePort (main <-> renderer).
import type { DeviceMessage } from './scrcpy/device-messages'
import type { StreamEvent } from './scrcpy/stream'

export interface StartSessionRequest {
  serial: string
  maxSize?: number
  videoBitRate?: number
  maxFps?: number
}

export type MainToRenderer =
  | { t: 'video'; ev: StreamEvent }
  | { t: 'device'; msg: DeviceMessage }
  | { t: 'log'; line: string }
  | { t: 'closed'; error?: string }

export type RendererToMain = { t: 'control'; data: Uint8Array } | { t: 'stop' }

/** Quality presets (docs/FACTS.md): Wi-Fi gets a lower bitrate and resolution. */
export const QualityPreset = {
  usb: { videoBitRate: 8_000_000, maxSize: 0 },
  wifi: { videoBitRate: 4_000_000, maxSize: 1280 },
} as const
