// The only surface the renderer can reach (contextIsolation + sandbox).
import type { FileResult, StartSessionRequest } from '../shared/ipc'

export interface TransportInfo {
  serial: string
  state: string
  kind: 'usb' | 'wifi'
  model?: string
}

export interface DeviceInfo {
  id: string
  model: string
  sdk?: number
  transports: TransportInfo[]
}

export interface DeviceListInfo {
  devices: DeviceInfo[]
  other: TransportInfo[]
}

export interface OpResult {
  ok: boolean
  message: string
}

export interface AdbStatusInfo {
  adbPath: string | null
  clientVersion?: string
  serverVersion?: string
  serverPath?: string
  mdnsBackend?: string
}

export type QrState =
  | { state: 'waiting' }
  | { state: 'pairing'; hostPort: string }
  | { state: 'paired'; message: string }
  | { state: 'error'; message: string }

export interface MobMirrorApi {
  adbStatus(): Promise<AdbStatusInfo>
  /** Current list; also starts live tracking (see onDevicesChanged). */
  listDevices(): Promise<DeviceListInfo>
  onDevicesChanged(cb: (list: DeviceListInfo) => void): () => void
  /** Resolves once the session is up. The MessagePort arrives as a window "message"
   *  event with data.type === 'mob-mirror:session-port'. */
  startSession(req: StartSessionRequest): Promise<{ deviceName: string }>
  stopSession(): Promise<void>
  readClipboard(): Promise<string>
  writeClipboard(text: string): Promise<void>
  pair(hostPort: string, code: string): Promise<OpResult>
  connect(hostPort: string): Promise<OpResult>
  disconnect(serial: string): Promise<OpResult>
  enableTcpip(serial: string): Promise<OpResult>
  startQrPairing(): Promise<{ svg: string; name: string }>
  cancelQrPairing(): Promise<void>
  onQrState(cb: (s: QrState) => void): () => void
  openDeviceWindow(serial: string, kind: 'usb' | 'wifi'): Promise<void>
  pathForFile(file: File): string
  /** APKs are installed; other files are copied to /sdcard/Download on the mirrored device. */
  dropFiles(paths: string[]): Promise<FileResult[]>
  /** Returns the saved path (~/Pictures/Mob Mirror). */
  saveScreenshot(png: Uint8Array, deviceName: string): Promise<string>
  /** Returns a recording id; chunks are appended to ~/Movies/Mob Mirror/<name>.<ext>. */
  startRecording(deviceName: string, ext: 'mp4' | 'webm'): Promise<number>
  writeRecording(id: number, chunk: Uint8Array): Promise<void>
  stopRecording(id: number): Promise<string | null>
  reveal(path: string): Promise<void>
}

declare global {
  interface Window {
    mobMirror: MobMirrorApi
  }
}
