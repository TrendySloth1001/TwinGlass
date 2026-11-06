import { contextBridge, ipcRenderer } from 'electron'
import type { MobMirrorApi } from './api'

const api: MobMirrorApi = {
  adbStatus: () => ipcRenderer.invoke('adb:status'),
  listDevices: () => ipcRenderer.invoke('devices:list'),
}

contextBridge.exposeInMainWorld('mobMirror', api)
