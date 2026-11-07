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
  videoCodec?: 'h264' | 'h265'
  /** Keep the phone awake while mirroring (plugged in). Default true. */
  stayAwake?: boolean
  /** Sync the phone clipboard to the Mac automatically (scrcpy clipboard_autosync). Default true. */
  clipboardAutosync?: boolean
  /** Second screen: mirror a new virtual display of this size instead of the phone's screen. */
  newDisplay?: { width: number; height: number; dpi?: number }
  /** Package to open on the second screen once it is up. */
  startApp?: string
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
  | { t: 'lock'; locked: boolean; appPrompt: string | null }
  /** `unexpected`: not requested by the user (link died, server exited) -> the renderer reconnects. */
  | { t: 'closed'; error?: string; unexpected: boolean }

export type RendererToMain = { t: 'control'; data: Uint8Array } | { t: 'stop' }
