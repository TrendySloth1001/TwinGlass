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
  /** PNG data URL from the Twinglass phone app; absent = draw a letter tile. */
  icon?: string
}

export interface ClipItemInfo {
  id: number
  text: string
  at: number
  source: 'mac' | 'phone'
}

export interface UpdateInfo {
  current: string
  latest: string | null
  url: string | null
  notes: string | null
  available: boolean
  /** A release feed is set in package.json ("mobMirror.updateRepo" / "updateFeed"). */
  configured: boolean
  /** Can update in place (packaged, writable folder, release has the DMG and its .sha256). */
  canInstall: boolean
  error?: string
}

export interface AboutInfo {
  version: string
  electron: string
  chrome: string
  node: string
  macos: string
  arch: string
  scrcpy: string
  /** The phone app bundled with this Mac app. */
  phoneApp: string | null
  packaged: boolean
}

export type AboutLink = 'repo' | 'releases' | 'issues' | 'new-issue' | 'changelog' | 'scrcpy'

export interface UpdateProgress {
  phase: 'downloading' | 'verifying' | 'installing' | 'error'
  progress?: number
  error?: string
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
  /** Where agents act by default: "agent" = their own second screen, "phone" = the phone's screen. */
  workspace: 'agent' | 'phone'
  /** The agents' shell tool. */
  allowShell: boolean
  allowAppChanges: boolean
  allowDeviceSettings: boolean
  allowFiles: boolean
  /** Close the agent screen after this many idle minutes (0 = never). */
  idleCloseMin: number
  screenSize: 'phone' | 'tablet' | 'match'
  screenshotMaxDim: number
  jpegQuality: number
  error?: string
}

/** A phone paired over "Wi-Fi, no setup" (the Twinglass phone app, no developer mode). */
export interface DirectPhoneInfo {
  id: string
  name: string
  model: string
  online: boolean
  /** Tapped "Mirror to Mac" on the phone; a window opens for it. */
  offering: boolean
  mirroring: boolean
  pairedAt: number
  lastSeen: number
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
  listApps(fresh?: boolean, serial?: string): Promise<PhoneAppInfo[]>
  launchApp(pkg: string): Promise<void>
  /** Everything about a phone. source "phone-app" = from the Twinglass phone app (richer), "adb" = system properties only. */
  phoneDetails(serial: string): Promise<{ source: 'phone-app' | 'adb'; appVersion: string | null; sections: { title: string; rows: { label: string; value: string }[] }[] }>
  /** Packages open on this second screen and on the phone's own screen, front first. */
  runningApps(): Promise<{ here: string[]; phone: string[]; displayId: number | null }>
  /** Asks the Twinglass phone app for real app icons. Resolves with how many arrived; rejects "no-companion" when it isn't installed. */
  fetchAppIcons(serial: string): Promise<number>
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
  /** Updates (see main/update-check.ts): check, install in place (then relaunch), or open the page. */
  checkForUpdate(): Promise<UpdateInfo>
  /** Settings → About. */
  aboutInfo(): Promise<AboutInfo>
  /** Opens one of the project's links in the browser (fixed set). */
  openAboutLink(which: AboutLink): Promise<void>
  installUpdate(): Promise<void>
  downloadUpdate(url: string): Promise<void>
  onUpdateAvailable(cb: (u: UpdateInfo) => void): () => void
  onUpdateProgress(cb: (p: UpdateProgress) => void): () => void
  /** Companion app: per-phone install / link state; re-pair; install the bundled APK. */
  companionStatus(): Promise<{
    port: number
    /** The phone app version bundled with this Mac app. */
    bundled: string | null
    phones: { id: string; model: string; serial: string; installed: boolean; version: string | null; outdated: boolean; linked: boolean }[]
  }>
  /** A connected phone runs an older phone app than the bundled one (sent once per phone per run). */
  onPhoneAppOutdated(cb: (p: { serial: string; model: string; bundled: string }) => void): () => void
  companionRelink(): Promise<boolean>
  companionInstall(serial: string): Promise<boolean>
  /** Battery, maker, Android version and screen size of one phone (home screen card). */
  deviceDetails(serial: string): Promise<{
    battery: number | null
    charging: boolean
    manufacturer: string | null
    android: string | null
    screen: { width: number; height: number } | null
  } | null>
  /** Newest screenshots / recordings with Quick Look thumbnails (data URLs). */
  recentCaptures(limit?: number): Promise<{ path: string; name: string; kind: 'image' | 'video'; at: number; thumb: string | null }[]>
  openCapture(path: string): Promise<string>
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
  /** opts.second: mirror a new virtual display (a second screen), opening opts.app on it. */
  openDeviceWindow(serial: string, kind: 'usb' | 'wifi', opts?: { second?: boolean; app?: string }): Promise<void>
  /** Device menu items / their shortcuts (⌘B back, ⇧⌘H home…), sent to the focused window. */
  onDeviceAction(cb: (action: DeviceAction) => void): () => void
  /** View menu commands (toggle sidebar ⌘\, float/dock ⌥⌘\). */
  onUiCommand(
    cb: (cmd: 'toggle-sidebar' | 'toggle-sidebar-layout' | 'toggle-view' | 'open-settings' | 'open-palette' | 'open-clipboard' | 'send-clipboard' | 'open-second-screen') => void,
  ): () => void
  /** compact: phone-shaped window locked to `aspect` (video width / height); full: restore. */
  /** extra: chrome around the video besides the title strip and rail (nav bar, phone frame). */
  setWindowLayout(layout: 'compact' | 'full', aspect?: number, extra?: { width: number; height: number }): Promise<void>
  setAlwaysOnTop(on: boolean): Promise<void>
  /** Opens ~/Pictures/Twinglass (screenshots) or ~/Movies/Twinglass (recordings) in Finder. */
  openMediaFolder(kind: 'pictures' | 'videos'): Promise<string>
  /** Lock type/state of the mirrored phone and whether a secret is saved for it. */
  unlockStatus(): Promise<UnlockStatusInfo>
  /** Wakes the phone, shows the bouncer and types the secret (omit `secret` to use the saved one). */
  unlock(req: { secret?: string; remember?: boolean; target?: 'auto' | 'screen' }): Promise<OpResult>
  forgetUnlockSecret(): Promise<void>
  /** Local MCP server for coding agents (off by default). */
  agentStatus(): Promise<AgentStatusInfo>
  /** "Wi-Fi, no setup" phones. Mirror one with serial "direct:<id>". */
  directList(): Promise<DirectPhoneInfo[]>
  /** Opens pairing: a 6-digit code valid for 5 minutes (false closes it). */
  directPairing(open?: boolean): Promise<{ code: string; until: number } | null>
  directPairingState(): Promise<{ code: string; until: number } | null>
  /** Forgets it here and on the phone (told now if connected, else on its next connection). */
  directForget(id: string): Promise<{ told: boolean }>
  /** Serves the phone app on the Wi-Fi while open: its URL and a QR to scan (false stops it). */
  directApk(open?: boolean): Promise<{ url: string; qr: string } | null>
  onDirectChanged(cb: (phones: DirectPhoneInfo[]) => void): () => void
  setAgentEnabled(enabled: boolean): Promise<AgentStatusInfo>
  setAgentOptions(o: Partial<Pick<AgentStatusInfo, 'workspace' | 'allowShell' | 'allowAppChanges' | 'allowDeviceSettings' | 'allowFiles' | 'idleCloseMin' | 'screenSize' | 'screenshotMaxDim' | 'jpegQuality'>>): Promise<AgentStatusInfo>
  /** "Agents read any screen" (the phone app's accessibility service) on one phone. */
  agentA11yStatus(serial: string): Promise<{ app: boolean; enabled: boolean; connected: boolean }>
  setAgentA11y(serial: string, on: boolean): Promise<boolean>
  /** Advanced: move the MCP server to another port (the setup command must be copied again). */
  setAgentPort(port: number): Promise<AgentStatusInfo>
  /** Restores the phone settings agents changed (set_device_state). */
  agentResetDeviceState(serial: string): Promise<string>
  /** Copies the `claude mcp add …` command (with the token) to the clipboard; the token never reaches the page. */
  copyAgentSetup(): Promise<void>
  /** New token (old agent configs stop working); copies the new setup command. */
  regenerateAgentToken(): Promise<AgentStatusInfo>
  onAgentActivity(cb: (a: { summary: string; at: number }) => void): () => void
  onAgentStatus(cb: (s: AgentStatusInfo) => void): () => void
  /** Provides the current mirror frame (PNG) for fast agent screenshots; null when not mirroring. */
  /** Current frame for agents: PNG at full size, or a JPEG scaled to `size` when given (fast path). */
  setFrameCapture(
    fn:
      | ((
          size?: { width: number; height: number; quality?: number },
          /** screen_map: numbered boxes (in output pixels) and an optional grid drawn over the frame. */
          overlay?: { boxes: { x: number; y: number; w: number; h: number; label: string; depth: number }[]; grid?: number },
        ) => Promise<Uint8Array | null>)
      | null,
  ): void
  /** Lets agents start / stop this window's recording (stop resolves with the saved file). */
  setAgentRecorder(fn: ((on: boolean) => Promise<string | null>) | null): void
  /** APKs are installed; other files are copied to /sdcard/Download on the mirrored device. */
  /** Dropped on the mirror: APKs install, other files go to /sdcard/<folder> (default Download). */
  dropFiles(files: File[], folder?: 'Download' | 'Documents' | 'Pictures' | 'Movies'): Promise<FileResult[]>
  /** Returns the saved path (~/Pictures/Twinglass). */
  saveScreenshot(png: Uint8Array, deviceName: string): Promise<string>
  /** Returns a recording id; chunks are appended to ~/Movies/Twinglass/<name>.<ext>. */
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
