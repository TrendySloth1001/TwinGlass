import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import type { MobMirrorApi } from './api'

// A MessagePort can't cross contextBridge, so forward it to the page with window.postMessage
// (the pattern Electron documents for context-isolated preloads).
ipcRenderer.on('session:port', (e, info: { deviceName: string }) => {
  window.postMessage({ type: 'mob-mirror:session-port', deviceName: info.deviceName }, '*', e.ports)
})

// Agent screenshots: main asks for the current mirror frame; the page provides it as PNG bytes.
type CaptureOverlay = { boxes: { x: number; y: number; w: number; h: number; label: string; depth: number }[]; grid?: number }
let captureFn: ((size?: { width: number; height: number; quality?: number }, overlay?: CaptureOverlay) => Promise<Uint8Array | null>) | null = null
ipcRenderer.on('agent:capture', (_e, id: number, size?: { width: number; height: number; quality?: number }, overlay?: CaptureOverlay) => {
  const fn = captureFn
  const ok = size && Number.isInteger(size.width) && Number.isInteger(size.height) && size.width > 0 && size.height > 0 && size.width <= 4096 && size.height <= 4096
  const boxes = Array.isArray(overlay?.boxes) ? overlay.boxes.slice(0, 2000) : null
  const quality = typeof size?.quality === 'number' && size.quality >= 0.5 && size.quality <= 0.95 ? size.quality : undefined
  void (fn ? fn(ok ? { width: size.width, height: size.height, quality } : undefined, boxes ? { boxes, grid: overlay?.grid } : undefined) : Promise.resolve(null))
    .catch(() => null)
    .then((png) => ipcRenderer.send('agent:capture-result', id, png))
})

// Agent recordings (record_screen): main asks this window's recorder to start / stop.
let recordFn: ((on: boolean) => Promise<string | null>) | null = null
ipcRenderer.on('agent:record', (_e, id: number, on: boolean) => {
  const fn = recordFn
  void (fn ? fn(on === true) : Promise.reject(new Error('not mirroring')))
    .then(
      (path) => ipcRenderer.send('agent:record-result', id, { ok: true, path }),
      (e: unknown) => ipcRenderer.send('agent:record-result', id, { ok: false, error: e instanceof Error ? e.message : String(e) }),
    )
})

/** Subscribes to a main -> renderer channel; returns an unsubscribe function. */
function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.off(channel, listener)
}

type UpdateInfoT = Parameters<Parameters<MobMirrorApi['onUpdateAvailable']>[0]>[0]
type UpdateProgressT = Parameters<Parameters<MobMirrorApi['onUpdateProgress']>[0]>[0]

const api: MobMirrorApi = {
  adbStatus: () => ipcRenderer.invoke('adb:status'),
  restartAdbServer: () => ipcRenderer.invoke('adb:restart-server'),
  rotateDevice: () => ipcRenderer.invoke('device:rotate'),
  listApps: (fresh?: boolean, serial?: string) => ipcRenderer.invoke('apps:list', fresh === true, serial),
  phoneDetails: (serial: string) => ipcRenderer.invoke('phone:details', serial),
  runningApps: () => ipcRenderer.invoke('apps:running'),
  fetchAppIcons: (serial: string) => ipcRenderer.invoke('apps:fetch-icons', serial),
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
  checkForUpdate: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: (url: string) => ipcRenderer.invoke('update:download', url),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  aboutInfo: () => ipcRenderer.invoke('about:info'),
  openAboutLink: (which: string) => ipcRenderer.invoke('about:open', which),
  onUpdateProgress: (cb: (p: UpdateProgressT) => void) => subscribe('update:progress', cb),
  onUpdateAvailable: (cb: (u: UpdateInfoT) => void) => subscribe('update:available', cb),
  companionStatus: () => ipcRenderer.invoke('companion:status'),
  companionRelink: () => ipcRenderer.invoke('companion:relink'),
  onPhoneAppOutdated: (cb: (p: { serial: string; model: string; bundled: string }) => void) => subscribe('companion:outdated', cb),
  companionInstall: (serial: string) => ipcRenderer.invoke('companion:install', serial),
  deviceDetails: (serial: string) => ipcRenderer.invoke('devices:details', serial),
  recentCaptures: (limit?: number) => ipcRenderer.invoke('media:recent', limit),
  openCapture: (path: string) => ipcRenderer.invoke('media:open', path),
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
  openDeviceWindow: (serial, kind, opts) => ipcRenderer.invoke('window:open-device', serial, kind, opts),
  onDeviceAction: (cb) => subscribe('device:action', cb),
  onUiCommand: (cb) => subscribe('ui:command', cb),
  devPanel: {
    front: (device) => ipcRenderer.invoke('devpanel:front', device),
    logcat: (device, pkg, level) => ipcRenderer.invoke('devpanel:logcat', device, pkg, level),
    crashes: (device, pkg) => ipcRenderer.invoke('devpanel:crashes', device, pkg),
    perf: (device, pkg) => ipcRenderer.invoke('devpanel:perf', device, pkg),
  },
  inspect: {
    map: (device) => ipcRenderer.invoke('inspect:map', device),
  },
  design: {
    tokenStatus: () => ipcRenderer.invoke('design:token-status'),
    setToken: (t) => ipcRenderer.invoke('design:set-token', t),
    clearToken: () => ipcRenderer.invoke('design:clear-token'),
    compare: (url, device) => ipcRenderer.invoke('design:compare', url, device),
    screen: (device) => ipcRenderer.invoke('design:screen', device),
  },
  tests: {
    list: () => ipcRenderer.invoke('tests:list'),
    save: (t) => ipcRenderer.invoke('tests:save', t),
    delete: (name) => ipcRenderer.invoke('tests:delete', name),
    begin: (device) => ipcRenderer.invoke('tests:begin', device),
    snapshot: (device) => ipcRenderer.invoke('tests:snapshot', device),
    describeTap: (device, at, long) => ipcRenderer.invoke('tests:describe-tap', device, at, long),
    describeCheck: (device, at) => ipcRenderer.invoke('tests:describe-check', device, at),
    run: (name, device, screen) => ipcRenderer.invoke('tests:run', name, device, screen),
    onProgress: (cb) => subscribe('tests:progress', cb),
    onChanged: (cb) => subscribe('tests:changed', cb),
  },
  tabs: {
    open: (target) => ipcRenderer.invoke('tabs:open', target),
    list: () => ipcRenderer.invoke('tabs:list'),
    onChanged: (cb) => subscribe('tabs:changed', cb),
    select: (id) => ipcRenderer.send('tabs:select', id),
    close: (id) => ipcRenderer.send('tabs:close', id),
    setBounds: (r) => ipcRenderer.send('tabs:bounds', r),
    setCovered: (c) => ipcRenderer.send('tabs:cover', c),
    setTitle: (t) => ipcRenderer.send('tabs:title', t),
    closeSelf: () => ipcRenderer.send('tabs:self-close'),
    popOut: () => ipcRenderer.send('tabs:popout'),
    command: (cmd) => ipcRenderer.send('tabs:command', cmd),
    reportStats: (stats) => ipcRenderer.send('tabs:stats', stats),
    onStats: (cb) => subscribe('tabs:stats', cb),
  },
  setWindowLayout: (layout, aspect, extra) => ipcRenderer.invoke('window:layout', layout, aspect, extra),
  setAlwaysOnTop: (on: boolean) => ipcRenderer.invoke('window:always-on-top', on),
  openMediaFolder: (kind: 'pictures' | 'videos') => ipcRenderer.invoke('media:open-folder', kind),
  unlockStatus: () => ipcRenderer.invoke('unlock:status'),
  unlock: (req) => ipcRenderer.invoke('unlock:run', req),
  forgetUnlockSecret: () => ipcRenderer.invoke('unlock:forget'),
  agentStatus: () => ipcRenderer.invoke('agent:status'),
  setAgentEnabled: (enabled) => ipcRenderer.invoke('agent:set-enabled', enabled),
  setAgentOptions: (o) => ipcRenderer.invoke('agent:set-options', o),
  agentA11yStatus: (serial) => ipcRenderer.invoke('agent:a11y-status', serial),
  setAgentA11y: (serial, on) => ipcRenderer.invoke('agent:a11y-set', serial, on),
  setAgentPort: (port) => ipcRenderer.invoke('agent:set-port', port),
  agentResetDeviceState: (serial) => ipcRenderer.invoke('agent:reset-device-state', serial),
  copyAgentSetup: () => ipcRenderer.invoke('agent:copy-setup'),
  regenerateAgentToken: () => ipcRenderer.invoke('agent:regenerate-token'),
  onAgentActivity: (cb) => subscribe('agent:activity', cb),
  onAgentStatus: (cb) => subscribe('agent:status', cb),
  directList: () => ipcRenderer.invoke('direct:list'),
  directPairing: (open) => ipcRenderer.invoke('direct:pairing', open),
  directPairingState: () => ipcRenderer.invoke('direct:pairing-state'),
  directForget: (id) => ipcRenderer.invoke('direct:forget', id),
  directApk: (open) => ipcRenderer.invoke('direct:apk', open),
  onDirectChanged: (cb) => subscribe('direct:changed', cb),
  setFrameCapture: (fn) => {
    captureFn = fn
  },
  setAgentRecorder: (fn) => {
    recordFn = fn
  },
  // Only real dropped File objects are accepted: the page can't hand main an arbitrary path string.
  // (Sandboxed renderers have no File.path; webUtils.getPathForFile is the supported replacement.)
  dropFiles: (files, folder) =>
    ipcRenderer.invoke(
      'files:drop',
      files.map((f) => webUtils.getPathForFile(f)).filter((p) => p.length > 0),
      folder,
    ),
  saveScreenshot: (png, deviceName) => ipcRenderer.invoke('media:screenshot', png, deviceName),
  startRecording: (deviceName, ext) => ipcRenderer.invoke('media:record:start', deviceName, ext),
  writeRecording: (id, chunk) => ipcRenderer.invoke('media:record:chunk', id, chunk),
  stopRecording: (id) => ipcRenderer.invoke('media:record:stop', id),
  reveal: (path) => ipcRenderer.invoke('media:reveal', path),
}

contextBridge.exposeInMainWorld('mobMirror', api)
