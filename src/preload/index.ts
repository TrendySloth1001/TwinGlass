import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import type { MobMirrorApi } from './api'

// A MessagePort can't cross contextBridge, so forward it to the page with window.postMessage
// (the pattern Electron documents for context-isolated preloads).
ipcRenderer.on('session:port', (e, info: { deviceName: string }) => {
  window.postMessage({ type: 'mob-mirror:session-port', deviceName: info.deviceName }, '*', e.ports)
})

/** Subscribes to a main -> renderer channel; returns an unsubscribe function. */
function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.off(channel, listener)
}

const api: MobMirrorApi = {
  adbStatus: () => ipcRenderer.invoke('adb:status'),
  listDevices: () => ipcRenderer.invoke('devices:list'),
  onDevicesChanged: (cb) => subscribe('devices:changed', cb),
  startSession: (req) => ipcRenderer.invoke('session:start', req),
  stopSession: () => ipcRenderer.invoke('session:stop'),
  readClipboard: () => ipcRenderer.invoke('clipboard:read'),
  writeClipboard: (text) => ipcRenderer.invoke('clipboard:write', text),
  pair: (hostPort, code) => ipcRenderer.invoke('wireless:pair', hostPort, code),
  connect: (hostPort) => ipcRenderer.invoke('wireless:connect', hostPort),
  disconnect: (serial) => ipcRenderer.invoke('wireless:disconnect', serial),
  enableTcpip: (serial) => ipcRenderer.invoke('wireless:tcpip', serial),
  startQrPairing: () => ipcRenderer.invoke('wireless:qr:start'),
  cancelQrPairing: () => ipcRenderer.invoke('wireless:qr:cancel'),
  onQrState: (cb) => subscribe('wireless:qr:state', cb),
  openDeviceWindow: (serial, kind) => ipcRenderer.invoke('window:open-device', serial, kind),
  onDeviceAction: (cb) => subscribe('device:action', cb),
  // Only real dropped File objects are accepted: the page can't hand main an arbitrary path string.
  // (Sandboxed renderers have no File.path; webUtils.getPathForFile is the supported replacement.)
  dropFiles: (files) =>
    ipcRenderer.invoke(
      'files:drop',
      files.map((f) => webUtils.getPathForFile(f)).filter((p) => p.length > 0),
    ),
  saveScreenshot: (png, deviceName) => ipcRenderer.invoke('media:screenshot', png, deviceName),
  startRecording: (deviceName, ext) => ipcRenderer.invoke('media:record:start', deviceName, ext),
  writeRecording: (id, chunk) => ipcRenderer.invoke('media:record:chunk', id, chunk),
  stopRecording: (id) => ipcRenderer.invoke('media:record:stop', id),
  reveal: (path) => ipcRenderer.invoke('media:reveal', path),
}

contextBridge.exposeInMainWorld('mobMirror', api)
