// The only surface the renderer can reach (contextIsolation + sandbox).
import type { StartSessionRequest } from '../shared/ipc'

export interface TransportInfo {
  serial: string
  state: string
  kind: 'usb' | 'wifi'
  model?: string
}

export interface DeviceInfo {
  id: string
  model: string
  transports: TransportInfo[]
}

export interface MobMirrorApi {
  adbStatus(): Promise<{ adbPath: string | null }>
  listDevices(): Promise<{ devices: DeviceInfo[]; other: TransportInfo[] }>
  /** Resolves once the session is up. The MessagePort arrives as a window "message"
   *  event with data.type === 'mob-mirror:session-port'. */
  startSession(req: StartSessionRequest): Promise<{ deviceName: string }>
  stopSession(): Promise<void>
  readClipboard(): Promise<string>
  writeClipboard(text: string): Promise<void>
}

declare global {
  interface Window {
    mobMirror: MobMirrorApi
  }
}
