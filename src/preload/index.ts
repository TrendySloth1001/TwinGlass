import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import type { MobMirrorApi } from './api'

// A MessagePort can't cross contextBridge, so forward it to the page with window.postMessage
// (the pattern Electron documents for context-isolated preloads).
ipcRenderer.on('session:port', (e, info: { deviceName: string }) => {
  window.postMessage({ type: 'mob-mirror:session-port', deviceName: info.deviceName }, '*', e.ports)
})

// Agent screenshots: main asks for the current mirror frame; the page provides it as PNG bytes.
let captureFn: (() => Promise<Uint8Array | null>) | null = null
ipcRenderer.on('agent:capture', (_e, id: number) => {
  const fn = captureFn
  void (fn ? fn() : Promise.resolve(null))
    .catch(() => null)
    .then((png) => ipcRenderer.send('agent:capture-result', id, png))
})

/** Subscribes to a main -> renderer channel; returns an unsubscribe function. */
function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.off(channel, listener)
}

type UpdateInfoT = Parameters<Parameters<MobMirrorApi['onUpdateAvailable']>[0]>[0]

const api: MobMirrorApi = {
  adbStatus: () => ipcRenderer.invoke('adb:status'),
  restartAdbServer: () => ipcRenderer.invoke('adb:restart-server'),
  rotateDevice: () => ipcRenderer.invoke('device:rotate'),
  listApps: (fresh?: boolean) => ipcRenderer.invoke('apps:list', fresh === true),
  launchApp: (pkg: string) => ipcRenderer.invoke('apps:launch', pkg),
  sendToPhone: (text: string, mode: 'auto' | 'copy' | 'paste' = 'auto') => ipcRenderer.invoke('phone:send', text, mode),
  clipboardHistory: () => ipcRenderer.invoke('clipboard:history'),
  setClipboardHistoryEnabled: (on: boolean) => ipcRenderer.invoke('clipboard:history-set-enabled', on),
  clearClipboardHistory: () => ipcRenderer.invoke('clipboard:history-clear'),
  removeClipboardItem: (id: number) => ipcRenderer.invoke('clipboard:history-remove', id),
  useClipboardItem: (id: number) => ipcRenderer.invoke('clipboard:history-use', id),
  onClipboardHistoryChanged: (cb: () => void) => subscribe('clipboard:history-changed', cb),
  onConnectRequest: (cb: (t: { serial: string; kind: 'usb' | 'wifi' }) => void) => subscribe('ui:connect', cb),
  onAppError: (cb: (message: string) => void) => subscribe('app:error', cb),
  macScreenStatus: () => ipcRenderer.invoke('macscreen:status'),
  macScreenStart: () => ipcRenderer.invoke('macscreen:start'),
  macScreenStop: () => ipcRenderer.invoke('macscreen:stop'),
  macScreenOpenPrivacy: () => ipcRenderer.invoke('macscreen:open-privacy'),
  macScreenConfig: (json: string) => ipcRenderer.send('macscreen:config', json),
  macScreenChunk: (type: 1 | 2, ts: number, data: Uint8Array) => ipcRenderer.send('macscreen:chunk', type, ts, data),
  onMacScreen: (cb: (ev: { t: 'keyframe' } | { t: 'stop' } | { t: 'viewers'; n: number }) => void) => {
    const offs = [
      subscribe('macscreen:keyframe', () => cb({ t: 'keyframe' })),
      subscribe('macscreen:stop', () => cb({ t: 'stop' })),
      subscribe('macscreen:viewers', (n: number) => cb({ t: 'viewers', n })),
    ]
    return () => offs.forEach((o) => o())
  },
  checkForUpdate: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: (url: string) => ipcRenderer.invoke('update:download', url),
  onUpdateAvailable: (cb: (u: UpdateInfoT) => void) => subscribe('update:available', cb),
  setTrayVisible: (on: boolean) => ipcRenderer.invoke('app:set-tray', on),
  setLoginItem: (on?: boolean) => ipcRenderer.invoke('app:login-item', on),
  setRequireTouchId: (on: boolean) => ipcRenderer.invoke('unlock:set-require-touch-id', on),
  setTheme: (t: 'system' | 'light' | 'dark') => ipcRenderer.invoke('app:theme', t),
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
  onUiCommand: (cb) => subscribe('ui:command', cb),
  setWindowLayout: (layout, aspect, extra) => ipcRenderer.invoke('window:layout', layout, aspect, extra),
  setAlwaysOnTop: (on: boolean) => ipcRenderer.invoke('window:always-on-top', on),
  openMediaFolder: (kind: 'pictures' | 'videos') => ipcRenderer.invoke('media:open-folder', kind),
  unlockStatus: () => ipcRenderer.invoke('unlock:status'),
  unlock: (req) => ipcRenderer.invoke('unlock:run', req),
  forgetUnlockSecret: () => ipcRenderer.invoke('unlock:forget'),
  agentStatus: () => ipcRenderer.invoke('agent:status'),
  setAgentEnabled: (enabled) => ipcRenderer.invoke('agent:set-enabled', enabled),
  copyAgentSetup: () => ipcRenderer.invoke('agent:copy-setup'),
  regenerateAgentToken: () => ipcRenderer.invoke('agent:regenerate-token'),
  onAgentActivity: (cb) => subscribe('agent:activity', cb),
  onAgentStatus: (cb) => subscribe('agent:status', cb),
  setFrameCapture: (fn) => {
    captureFn = fn
  },
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
