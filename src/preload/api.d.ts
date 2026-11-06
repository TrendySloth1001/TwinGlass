// The only surface the renderer can reach (contextIsolation + sandbox).
import type { FileResult, StartSessionRequest } from '../shared/ipc'
import type { DeviceAction } from '../shared/shortcuts'

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

export interface PhoneAppInfo {
  label: string
  pkg: string
  system: boolean
}

export interface ClipItemInfo {
  id: number
  text: string
  at: number
  source: 'mac' | 'phone'
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

export interface AgentStatusInfo {
  enabled: boolean
  running: boolean
  port: number
  url: string
  error?: string
}

export interface UnlockStatusInfo {
  credential: 'NONE' | 'PIN' | 'PASSWORD' | 'PATTERN' | 'UNKNOWN'
  locked: boolean | null
  saved: boolean
  canSave: boolean
  /** Touch ID can be prompted now; required to use the saved secret. */
  touchId: boolean
  foreground: { package: string; activity: string } | null
  focusedWindow: string | null
  /** A recognised app-lock / confirm-PIN screen is in front of the unlocked phone. */
  credentialPrompt: boolean
  promptOwner: string | null
}

export type QrState =
  | { state: 'waiting' }
  | { state: 'pairing'; hostPort: string }
  | { state: 'paired'; message: string }
  | { state: 'error'; message: string }

export interface MobMirrorApi {
  adbStatus(): Promise<AdbStatusInfo>
  /** kill-server + start-server with this app's adb (fixes a version mismatch). */
  restartAdbServer(): Promise<AdbStatusInfo>
  /** Toggles portrait ↔ landscape on the mirrored phone (auto-rotate is restored afterwards). */
  rotateDevice(): Promise<{ rotation: number; autoRotate: boolean } | null>
  /** Installed apps with labels (from the phone, cached 5 min; fresh = re-read). */
  listApps(fresh?: boolean): Promise<PhoneAppInfo[]>
  launchApp(pkg: string): Promise<void>
  /** auto: a link opens on the phone, other text goes to its clipboard. copy / paste: clipboard (and paste). */
  sendToPhone(text: string, mode?: 'auto' | 'copy' | 'paste'): Promise<{ kind: 'opened'; url: string } | { kind: 'copied' } | { kind: 'pasted' }>
  clipboardHistory(): Promise<{ enabled: boolean; items: ClipItemInfo[] }>
  setClipboardHistoryEnabled(on: boolean): Promise<void>
  clearClipboardHistory(): Promise<void>
  removeClipboardItem(id: number): Promise<void>
  /** Puts an item back on the Mac clipboard. */
  useClipboardItem(id: number): Promise<boolean>
  onClipboardHistoryChanged(cb: () => void): () => void
  /** The menu bar icon asked this window to mirror a phone. */
  onConnectRequest(cb: (t: { serial: string; kind: 'usb' | 'wifi' }) => void): () => void
  /** A background error in the main process (logged; shown as a notification). */
  onAppError(cb: (message: string) => void): () => void
  setTrayVisible(on: boolean): Promise<void>
  /** Launch at login; without an argument just reads it. */
  setLoginItem(on?: boolean): Promise<boolean>
  /** Appearance preference for native UI (traffic lights, menus, dialogs). */
  /** Ask for Touch ID before the saved PIN is typed (agent unlocks always ask). */
  setRequireTouchId(on: boolean): Promise<void>
  setTheme(theme: 'system' | 'light' | 'dark'): Promise<void>
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
  /** Device menu items / their shortcuts (⌘B back, ⇧⌘H home…), sent to the focused window. */
  onDeviceAction(cb: (action: DeviceAction) => void): () => void
  /** View menu commands (toggle sidebar ⌘\, float/dock ⌥⌘\). */
  onUiCommand(
    cb: (cmd: 'toggle-sidebar' | 'toggle-sidebar-layout' | 'toggle-view' | 'open-settings' | 'open-palette' | 'open-clipboard' | 'send-clipboard') => void,
  ): () => void
  /** compact: phone-shaped window locked to `aspect` (video width / height); full: restore. */
  /** extra: chrome around the video besides the title strip and rail (nav bar, phone frame). */
  setWindowLayout(layout: 'compact' | 'full', aspect?: number, extra?: { width: number; height: number }): Promise<void>
  setAlwaysOnTop(on: boolean): Promise<void>
  /** Opens ~/Pictures/Mob Mirror (screenshots) or ~/Movies/Mob Mirror (recordings) in Finder. */
  openMediaFolder(kind: 'pictures' | 'videos'): Promise<string>
  /** Lock type/state of the mirrored phone and whether a secret is saved for it. */
  unlockStatus(): Promise<UnlockStatusInfo>
  /** Wakes the phone, shows the bouncer and types the secret (omit `secret` to use the saved one). */
  unlock(req: { secret?: string; remember?: boolean; target?: 'auto' | 'screen' }): Promise<OpResult>
  forgetUnlockSecret(): Promise<void>
  /** Local MCP server for coding agents (off by default). */
  agentStatus(): Promise<AgentStatusInfo>
  setAgentEnabled(enabled: boolean): Promise<AgentStatusInfo>
  /** Copies the `claude mcp add …` command (with the token) to the clipboard; the token never reaches the page. */
  copyAgentSetup(): Promise<void>
  /** New token (old agent configs stop working); copies the new setup command. */
  regenerateAgentToken(): Promise<AgentStatusInfo>
  onAgentActivity(cb: (a: { summary: string; at: number }) => void): () => void
  onAgentStatus(cb: (s: AgentStatusInfo) => void): () => void
  /** Provides the current mirror frame (PNG) for fast agent screenshots; null when not mirroring. */
  setFrameCapture(fn: (() => Promise<Uint8Array | null>) | null): void
  /** APKs are installed; other files are copied to /sdcard/Download on the mirrored device. */
  dropFiles(files: File[]): Promise<FileResult[]>
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
