import { contextBridge, ipcRenderer } from 'electron'
import type { MobMirrorApi } from './api'

// A MessagePort can't cross contextBridge, so forward it to the page with window.postMessage
// (the pattern Electron documents for context-isolated preloads).
ipcRenderer.on('session:port', (e, info: { deviceName: string }) => {
  window.postMessage({ type: 'mob-mirror:session-port', deviceName: info.deviceName }, '*', e.ports)
})

const api: MobMirrorApi = {
  adbStatus: () => ipcRenderer.invoke('adb:status'),
  listDevices: () => ipcRenderer.invoke('devices:list'),
  startSession: (req) => ipcRenderer.invoke('session:start', req),
  stopSession: () => ipcRenderer.invoke('session:stop'),
  readClipboard: () => ipcRenderer.invoke('clipboard:read'),
  writeClipboard: (text) => ipcRenderer.invoke('clipboard:write', text),
}

contextBridge.exposeInMainWorld('mobMirror', api)
