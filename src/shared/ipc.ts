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
  videoCodec?: 'h264' | 'h265'
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
  /** Lock screen shown / dismissed on the phone (polled by main, sent on change). */
  | { t: 'lock'; locked: boolean }
  /** `unexpected`: not requested by the user (link died, server exited) -> the renderer reconnects. */
  | { t: 'closed'; error?: string; unexpected: boolean }

export type RendererToMain = { t: 'control'; data: Uint8Array } | { t: 'stop' }
