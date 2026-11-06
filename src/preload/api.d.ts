// The only surface the renderer can reach (contextIsolation + sandbox).

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
}

declare global {
  interface Window {
    mobMirror: MobMirrorApi
  }
}
