import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import type { TransportInfo } from '../../preload/api'
import { CompactTitleBar } from '@/components/compact-title-bar'
import { ControlRail } from '@/components/control-rail'
import type { PaletteMode } from '@/components/command-palette'
import { MirrorStage, type PhoneRect } from '@/components/mirror-stage'
import { NAV_BAR_HEIGHT, NavBar } from '@/components/nav-bar'
import { frameExtra, frameSpec } from '@/lib/phone-frames'
import { FRAMED_TITLE, GAP, NAV, RAIL_WIDTH, TITLE } from '@shared/compact-layout'
import { applyTheme } from '@/hooks/use-theme'
import { notify, setPopups } from '@/lib/notify'
import { MirrorToolbar } from '@/components/mirror-toolbar'
import { Sidebar } from '@/components/sidebar'
import { StatusBar, type TabStats } from '@/components/status-bar'
import { ActivityBar, EditorTabs, TitleBar, TITLE_BAR, type EditorTabSpec, type SideView } from '@/components/workbench'
import type { TabsState } from '../../preload/api'
import type { DeviceAction } from '@shared/shortcuts'
import { useDevices } from '@/hooks/use-devices'
import { useMirror } from '@/hooks/use-mirror'
import { useMediaQuery } from '@/hooks/use-media-query'
import { PHONE_DETAILS_EVENT } from '@/lib/phone-details'
import { startUpdate } from '@/lib/update'
import { DEFAULT_SETTINGS, STREAM_KEYS, useSettings } from '@/hooks/use-settings'

/** Windows opened via "Mirror in new window" carry #connect=<serial>&kind=<usb|wifi>. */
function autoConnectTarget(): TransportInfo | null {
  const h = new URLSearchParams(location.hash.slice(1))
  const serial = h.get('connect')
  const kind = h.get('kind')
  if (!serial || (kind !== 'usb' && kind !== 'wifi')) return null
  return { serial, kind, state: 'device' }
}

// Loaded on first use, so new windows (second screens, the agent screen) start with less code.
const ControlsHelp = lazy(() =>
  import('@/components/controls-help').then((m) => ({
    default: m.ControlsHelp,
  })),
)
const ConnectPanel = lazy(() =>
  import('@/components/connect-panel').then((m) => ({
    default: m.ConnectPanel,
  })),
)
const AppGrid = lazy(() => import('@/components/app-grid').then((m) => ({ default: m.AppGrid })))
const AppSwitcher = lazy(() => import('@/components/app-switcher').then((m) => ({ default: m.AppSwitcher })))
const PhoneDetailsDialog = lazy(() =>
  import('@/components/phone-details-dialog').then((m) => ({
    default: m.PhoneDetailsDialog,
  })),
)
const SettingsDialog = lazy(() =>
  import('@/components/settings-dialog').then((m) => ({
    default: m.SettingsDialog,
  })),
)
const UnlockDialog = lazy(() =>
  import('@/components/unlock-dialog').then((m) => ({
    default: m.UnlockDialog,
  })),
)
const CommandPalette = lazy(() =>
  import('@/components/command-palette').then((m) => ({
    default: m.CommandPalette,
  })),
)

/** Settings → Advanced → Second screen size. */
const SECOND_SCREEN_SIZES = {
  phone: { width: 1080, height: 2400, dpi: 420 },
  tablet: { width: 1600, height: 2560, dpi: 320 },
  landscape: { width: 2400, height: 1080, dpi: 320 },
} as const

/** True from the first time `open` is true: keeps a lazily loaded dialog mounted for its close animation. */
function useOpenedOnce(open: boolean): boolean {
  const [once, setOnce] = useState(open)
  if (open && !once) setOnce(true)
  return once || open
}

/** Second-screen windows carry #…&screen=second&app=<pkg> (a new virtual display, not the phone's screen). */
const SECOND_SCREEN: {
  app?: string
  agent?: boolean
  size?: { width: number; height: number; dpi: number }
} | null = (() => {
  const h = new URLSearchParams(location.hash.slice(1))
  if (h.get('screen') !== 'second') return null
  const app = h.get('app')
  // agent=1: the MCP agents' own second screen (they act here; the user watches).
  const size = /^(\d{3,4})x(\d{3,4})\/(\d{2,3})$/.exec(h.get('size') ?? '')
  return {
    ...(app && /^[\w.]+$/.test(app) ? { app } : {}),
    ...(h.get('agent') === '1' ? { agent: true } : {}),
    ...(size
      ? {
          size: {
            width: Number(size[1]),
            height: Number(size[2]),
            dpi: Number(size[3]),
          },
        }
      : {}),
  }
})()

const HASH = new URLSearchParams(location.hash.slice(1))
/** A tab's own page inside a window (main/tabs.ts): only the phone's controls and its stage. */
const EMBED = HASH.get('embed') === '1'
/** A window popped out of a tab with "mobile view": starts in the compact phone view. */
const START_COMPACT = HASH.get('view') === 'compact'
/** The main window: phones and second screens open as editor tabs here, as many as the user likes. */
const IS_HOST = !EMBED && !autoConnectTarget()

/** Update versions already offered in this window (the check repeats every 6 hours). */
const offeredUpdates = new Set<string>()


export function App(): ReactNode {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const devices = useDevices()
  /** Effective sidebar layout, readable from callbacks defined before it is computed. */
  const sidebarLayoutRef = useRef<'docked' | 'floating'>('docked')
  const mirror = useMirror(canvasRef, overlayRef)
  const [settings, updateSettings] = useSettings()
  const [helpOpen, setHelpOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  /** Full view: Settings is an editor tab next to the phone (or Welcome), like VS Code's. */
  const [settingsTab, setSettingsTab] = useState(false)
  /** A popped-out tab starts compact until the user picks the full view. */
  const [forceCompact, setForceCompact] = useState(START_COMPACT)
  const forceCompactRef = useRef(forceCompact)
  forceCompactRef.current = forceCompact
  /** 'main' (Welcome, or this window's phone), 'settings', or a phone tab's id. */
  const [editorTab, setEditorTab] = useState<string>('main')
  /** Phone tabs open in this window (main window only). */
  const [tabsState, setTabsState] = useState<TabsState>({ tabs: [], active: null })
  useEffect(() => {
    if (!IS_HOST) return
    const apply = (st: TabsState): void => {
      setTabsState(st)
      setEditorTab((prev) => st.active ?? (prev === 'settings' ? 'settings' : 'main'))
    }
    void window.mobMirror.tabs.list().then(apply)
    return window.mobMirror.tabs.onChanged(apply)
  }, [])
  const selectTab = useCallback((id: string) => {
    setEditorTab(id)
    if (IS_HOST) window.mobMirror.tabs.select(id === 'main' || id === 'settings' ? null : id)
  }, [])
  const compactRef = useRef(false)
  const openSettings = useCallback(() => {
    if (compactRef.current) setSettingsOpen(true)
    else {
      setSettingsTab(true)
      setEditorTab('settings')
      if (IS_HOST) window.mobMirror.tabs.select(null)
    }
  }, [])
  const closeSettingsTab = useCallback(() => {
    setSettingsTab(false)
    setEditorTab('main')
    if (IS_HOST) window.mobMirror.tabs.select(null)
  }, [])
  /** Phone details requests (menus anywhere dispatch PHONE_DETAILS_EVENT); the dialog loads on the first one. */
  const [detailsRequest, setDetailsRequest] = useState<{
    serial: string
    name: string
    n: number
  } | null>(null)
  useEffect(() => {
    let n = 0
    const on = (e: Event): void =>
      setDetailsRequest({
        ...(e as CustomEvent<{ serial: string; name: string }>).detail,
        n: ++n,
      })
    window.addEventListener(PHONE_DETAILS_EVENT, on)
    return () => window.removeEventListener(PHONE_DETAILS_EVENT, on)
  }, [])
  /** Second screen's app grid (its home screen). */
  const [gridOpen, setGridOpen] = useState(false)
  /** Second screens: Twinglass' own Recents (Android's shows nothing for a second screen). */
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [palette, setPalette] = useState<{ open: boolean; mode: PaletteMode }>({
    open: false,
    mode: 'all',
  })
  /** Framed phone body (viewport px): the compact strip and nav dock attach to it. */
  const [phoneRect, setPhoneRect] = useState<PhoneRect | null>(null)
  const [viewportW, setViewportW] = useState(window.innerWidth)
  useEffect(() => {
    const on = (): void => setViewportW(window.innerWidth)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  const [unlockOpen, setUnlockOpen] = useState(false)
  const { connect, runAction } = mirror
  const live = mirror.state.phase === 'live'

  const [unlockError, setUnlockError] = useState<string | null>(null)
  const unlocking = useRef(false)

  /**
   * ⌘L / toolbar / banner. With a saved PIN and Touch ID available, go straight to the system
   * Touch ID prompt (no extra click); the dialog only opens when a PIN must be typed or it failed.
   */
  const quickUnlock = useCallback(async () => {
    if (unlocking.current) return
    unlocking.current = true
    try {
      const st = await window.mobMirror.unlockStatus()
      // Unlocked and no recognised app-lock prompt: let the user decide (the dialog can type the PIN
      // into the current screen if an app is asking for it).
      if (st.locked === false && !st.credentialPrompt) {
        setUnlockError(null)
        setUnlockOpen(true)
        return
      }
      // Saved PIN: typed straight away (or after Touch ID when the user turned that on).
      const touch = settingsRef.current.requireTouchId
      if (st.saved && (!touch || st.touchId) && st.credential !== 'PATTERN') {
        const id = toast.loading(touch ? 'Unlocking… confirm with Touch ID' : 'Unlocking…')
        const r = await window.mobMirror.unlock({})
        if (r.ok) {
          toast.success(r.message, { id })
          return
        }
        toast.dismiss(id)
        setUnlockError(r.message)
      } else setUnlockError(null)
      setUnlockOpen(true)
    } catch (e) {
      setUnlockError(String(e))
      setUnlockOpen(true)
    } finally {
      unlocking.current = false
    }
  }, [])

  /** One dispatcher for the Device menu, toolbar and banner: some actions need app-level UI. */
  const dispatch = useCallback(
    (action: DeviceAction) => {
      if (action === 'unlockManual') {
        // Always possible: type a PIN by hand (e.g. an app lock with its own PIN), saved one or not.
        if (live) {
          setUnlockError(null)
          setUnlockOpen(true)
        }
      } else if (action === 'unlock') {
        if (live) void quickUnlock()
      } else if (action === 'disconnect' && EMBED) {
        runAction('disconnect')
        window.mobMirror.tabs.closeSelf()
      } else if (action === 'recents' && SECOND_SCREEN && live) {
        setGridOpen(false)
        setSwitcherOpen((o) => !o)
      } else {
        setSwitcherOpen(false)
        runAction(action)
        // Second screen: Home also brings up Twinglass' app grid (its home screen; the phone's own
        // secondary-display launcher is often just an empty wallpaper).
        if (action === 'home' && SECOND_SCREEN && live) setGridOpen(true)
      }
    },
    [live, quickUnlock, runAction],
  )

  const onMirror = useCallback(
    (t: TransportInfo, deviceId?: string) => {
      // A floating sidebar would cover the mirror that is about to start: tuck it away.
      if (sidebarLayoutRef.current === 'floating') updateSettings({ sidebarOpen: false })
      if (deviceId) {
        const model = devices.list?.devices.find((d) => d.id === deviceId)?.model ?? t.model ?? deviceId
        const recent = [{ id: deviceId, model, at: Date.now() }, ...settings.recentDevices.filter((r) => r.id !== deviceId)].slice(0, 8)
        updateSettings({ lastDevice: deviceId, recentDevices: recent })
      }
      if (IS_HOST) {
        // The main window doesn't mirror in its own page: every phone gets a tab.
        void window.mobMirror.tabs.open({ serial: t.serial, kind: t.kind })
        return
      }
      void connect(t, {
        audio: settings.audio,
        showTouches: settings.showTouches,
        quality: settings.quality,
        codec: settings.codec,
        maxFps: settings.maxFps,
        stayAwake: settings.stayAwake,
        clipboardSync: settings.clipboardSync,
        bitrateMbps: settings.bitrateMbps,
        maxSizeOverride: settings.maxSizeOverride,
        decoder: settings.decoder,
        reconnectSec: settings.reconnectSec,
        secondScreenKeepApps: settings.secondScreenKeepApps,
        // Your own second screens use Settings → Advanced → size; the agent screen brings its own.
        secondScreen: SECOND_SCREEN ? { ...SECOND_SCREEN, size: SECOND_SCREEN.size ?? SECOND_SCREEN_SIZES[settings.secondScreenSize] } : undefined,
        deviceId,
      })
    },
    [connect, settings, updateSettings, devices.list],
  )

  /** Session settings apply immediately: restart a live mirror with the new values. */
  const { restart } = mirror
  const { setShowTouches } = mirror
  const onSettingsChange = useCallback(
    (patch: Partial<typeof settings>) => {
      updateSettings(patch)
      // Most settings are instant. Only stream settings (quality, codec, audio, fps, …) need a
      // new stream, so only those restart a live mirror.
      if (patch.showTouches !== undefined) setShowTouches(patch.showTouches)
      const streamPatch = Object.fromEntries(Object.entries(patch).filter(([k]) => (STREAM_KEYS as readonly string[]).includes(k)))
      if (Object.keys(streamPatch).length) void restart(streamPatch)
    },
    [restart, setShowTouches, updateSettings],
  )

  // Device menu shortcuts (⌘B back, ⇧⌘H home, …) arrive from main for the focused window.
  useEffect(() => window.mobMirror.onDeviceAction(dispatch), [dispatch])
  // The session ended: a dialog about the phone makes no sense anymore.
  useEffect(() => {
    if (!live) setUnlockOpen(false)
  }, [live])

  // A tab page reports its stream numbers to its window's status bar (at most once a second).
  const lastReport = useRef(0)
  useEffect(() => {
    if (!EMBED) return
    const now = Date.now()
    if (now - lastReport.current < 900 && mirror.state.stats) return
    lastReport.current = now
    const { stats, audio, muted, recordingSince } = mirror.state
    window.mobMirror.tabs.reportStats({ stats, audio, muted, recordingSince } satisfies TabStats)
  }, [mirror.state.stats, mirror.state.audio, mirror.state.muted, mirror.state.recordingSince])
  // The main window keeps the latest numbers of each of its phone tabs.
  const [tabStats, setTabStats] = useState<Record<string, TabStats>>({})
  useEffect(() => {
    if (!IS_HOST) return
    return window.mobMirror.tabs.onStats(({ id, stats }) => setTabStats((m) => ({ ...m, [id]: stats as TabStats })))
  }, [])

  // A tab page names its tab after the phone.
  useEffect(() => {
    if (EMBED && mirror.state.deviceName) window.mobMirror.tabs.setTitle(SECOND_SCREEN ? `${mirror.state.deviceName} · Second screen` : mirror.state.deviceName)
  }, [mirror.state.deviceName])

  // Windows opened for a phone ("new window", second screen) connect once on load. Scheduled and
  // cancelled in cleanup (StrictMode-safe): React's dev double-mount runs the mirror hook's unmount
  // cleanup, which cancels an in-flight connect; connecting directly here orphaned it ("Starting
  // mirror…" forever) and the once-guard then blocked the retry.
  const autoConnected = useRef(false)
  useEffect(() => {
    const target = autoConnectTarget()
    if (!target || autoConnected.current) return
    const t = setTimeout(() => {
      autoConnected.current = true
      onMirror(target)
    }, 0)
    return () => clearTimeout(t)
  }, [onMirror])

  // Auto-connect: when the phone used last time (or, the first time, the only ready phone) appears,
  // mirror it without a click. Edge-triggered (absent -> present), so Disconnect stays disconnected
  // until the phone is unplugged / drops off Wi-Fi and comes back.
  const present = useRef<Set<string> | null>(null)
  const idle = mirror.state.phase === 'idle'
  useEffect(() => {
    const list = devices.list
    if (!list) return
    const now = new Set(list.devices.map((d) => d.id))
    const before = present.current
    present.current = now
    if (!idle || !settings.autoConnect || autoConnectTarget()) return
    const appeared = (id: string): boolean => now.has(id) && !before?.has(id)
    const pick =
      (settings.lastDevice && appeared(settings.lastDevice) && list.devices.find((d) => d.id === settings.lastDevice)) ||
      (!settings.lastDevice && list.devices.length === 1 && list.devices[0] && appeared(list.devices[0].id) && list.devices[0]) ||
      null
    const t = pick ? pick.transports[0] : undefined
    if (pick && t) onMirror(t, pick.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only device-list changes should trigger this
  }, [devices.list])

  // View menu: ⌘\ toggles the sidebar, ⌥⌘\ switches docked <-> floating.
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  useEffect(
    () =>
      window.mobMirror.onUiCommand((cmd) => {
        const s = settingsRef.current
        if (cmd === 'open-settings') openSettings()
        else if (cmd === 'open-second-screen') setPalette({ open: true, mode: 'second' })
        else if (cmd === 'open-palette') setPalette({ open: true, mode: 'all' })
        else if (cmd === 'open-clipboard') setPalette({ open: true, mode: 'clipboard' })
        else if (cmd === 'send-clipboard') {
          void window.mobMirror
            .readClipboard()
            .then((t: string) => (t ? window.mobMirror.sendToPhone(t, 'auto') : Promise.reject(new Error('The Mac clipboard is empty.'))))
            .then(
              (r) => toast.success(r.kind === 'opened' ? 'Opened on the phone' : 'Copied to the phone'),
              (e: unknown) => toast.error(e instanceof Error ? e.message : String(e)),
            )
        } else if (cmd === 'toggle-view') {
          // A tab page's "compact view" is popping out into its own window.
          if (EMBED) window.mobMirror.tabs.popOut()
          else {
            setForceCompact(false)
            updateSettings({ viewMode: s.viewMode === 'compact' || forceCompactRef.current ? 'full' : 'compact' })
          }
        }
        else if (cmd === 'toggle-sidebar') updateSettings({ sidebarOpen: !s.sidebarOpen })
        else
          updateSettings({
            sidebarLayout: s.sidebarLayout === 'floating' ? 'docked' : 'floating',
            sidebarOpen: true,
          })
      }),
    [updateSettings],
  )
  useEffect(() => applyTheme(settings.theme), [settings.theme])
  // A whole-phone second screen (no specific app) opens on its home screen: the app grid.
  const gridShownOnce = useRef(false)
  useEffect(() => {
    if (SECOND_SCREEN && !SECOND_SCREEN.app && !SECOND_SCREEN.agent && live && !gridShownOnce.current) {
      gridShownOnce.current = true
      setGridOpen(true)
    }
    if (!live) setGridOpen(false)
  }, [live])
  useEffect(() => void window.mobMirror.setTrayVisible(settings.showTray).catch(() => {}), [settings.showTray])
  useEffect(() => void window.mobMirror.setClipboardHistoryEnabled(settings.clipboardHistory).catch(() => {}), [settings.clipboardHistory])
  // The menu bar icon asked this window to mirror a phone.
  useEffect(() => window.mobMirror.onConnectRequest((t) => onMirror({ ...t, state: 'device' })), [onMirror])
  // Updates also live in the title bar (the newest one wins) until they're installed.
  const [macUpdate, setMacUpdate] = useState<Parameters<typeof startUpdate>[0] | null>(null)
  const [phoneUpdate, setPhoneUpdate] = useState<{ serial: string; model: string; bundled: string } | null>(null)
  useEffect(() => {
    if (EMBED) return
    void window.mobMirror.checkForUpdate().then((u) => u.available && u.latest && setMacUpdate(u), () => {})
    const offMac = window.mobMirror.onUpdateAvailable((u) => u.available && u.latest && setMacUpdate(u))
    const offPhone = window.mobMirror.onPhoneAppOutdated(setPhoneUpdate)
    return () => {
      offMac()
      offPhone()
    }
  }, [])
  const updatePhoneApp = (ph: { serial: string; model: string }): void => {
    const id = toast.loading(`Updating the phone app on ${ph.model}…`)
    window.mobMirror.companionInstall(ph.serial).then(
      () => {
        toast.success(`Phone app updated on ${ph.model}`, { id })
        setPhoneUpdate(null)
      },
      (e: unknown) => toast.error('Couldn’t update the phone app', { id, description: e instanceof Error ? e.message : String(e) }),
    )
  }
  useEffect(
    () =>
      window.mobMirror.onUpdateAvailable((u) => {
        // Once per version per window (the check repeats every 6 hours).
        if (!u.latest || offeredUpdates.has(u.latest)) return
        offeredUpdates.add(u.latest)
        notify('info', `Twinglass ${u.latest} is available`, {
          description: u.canInstall ? `You have ${u.current}. It installs in a few seconds and reopens.` : `You have ${u.current}.`,
          action: u.canInstall || u.url ? { label: u.canInstall ? 'Update' : 'Download', run: () => startUpdate(u) } : undefined,
        })
      }),
    [],
  )
  useEffect(
    () =>
      window.mobMirror.onPhoneAppOutdated((ph) =>
        notify('info', `Phone app update for ${ph.model}`, {
          description: `Twinglass ${ph.bundled} for the phone is ready. It installs over the cable or wireless debugging and keeps its settings.`,
          action: {
            label: 'Update',
            run: () => {
              const id = toast.loading(`Updating the phone app on ${ph.model}…`)
              window.mobMirror.companionInstall(ph.serial).then(
                () => toast.success(`Phone app updated on ${ph.model}`, { id }),
                (e: unknown) => toast.error('Couldn’t update the phone app', { id, description: e instanceof Error ? e.message : String(e) }),
              )
            },
          },
        }),
      ),
    [],
  )
  useEffect(
    () =>
      window.mobMirror.onAppError((m) =>
        notify('error', 'Something went wrong in the background', {
          description: m,
        }),
      ),
    [],
  )
  useEffect(() => void window.mobMirror.setRequireTouchId(settings.requireTouchId).catch(() => {}), [settings.requireTouchId])
  const { setInputOptions, setAutoReconnect } = mirror
  useEffect(() => setAutoReconnect(settings.autoReconnect), [setAutoReconnect, settings.autoReconnect])
  useEffect(() => setPopups(settings.popups), [settings.popups])
  useEffect(
    () =>
      setInputOptions({
        mouseShortcuts: settings.mouseShortcuts,
        invertScroll: settings.invertScroll,
        scrollSpeed: settings.scrollSpeed,
      }),
    [setInputOptions, settings.mouseShortcuts, settings.invertScroll, settings.scrollSpeed],
  )
  useEffect(() => void window.mobMirror.setAlwaysOnTop(settings.alwaysOnTop).catch(() => {}), [settings.alwaysOnTop])
  // "Turn phone screen off when mirroring starts": once per session going live.
  const wasLive = useRef(false)
  useEffect(() => {
    if (live && !wasLive.current && settings.screenOffOnStart && !mirror.state.screenOff) runAction('screenOff')
    wasLive.current = live
  }, [live, settings.screenOffOnStart, mirror.state.screenOff, runAction])

  // Compact mirror (default while a phone is mirrored): phone-shaped window + control rail. The full
  // view (devices, settings, toolbar) is one click away and is used when nothing is mirrored.
  const compact =
    !EMBED && (settings.viewMode === 'compact' || forceCompact) && (mirror.state.phase === 'live' || mirror.state.phase === 'reconnecting')
  /** VS Code's workbench (title bar, activity bar, side bar, status bar); a tab page has none of it. */
  const workbench = !compact && !EMBED
  compactRef.current = compact
  const framed = compact && settings.frame !== 'none'
  const helpMounted = useOpenedOnce(helpOpen)
  const paletteMounted = useOpenedOnce(palette.open)
  const settingsMounted = useOpenedOnce(settingsOpen)
  const unlockMounted = useOpenedOnce(unlockOpen)
  const onPhoneNow = mirror.state.phase !== 'idle'
  const phoneNameNow = mirror.state.deviceName || (mirror.state.phase === 'connecting' ? 'Connecting…' : '')
  // Phone a second screen opens on: the mirrored one, else the home screen's first phone.
  const secondTarget: TransportInfo | undefined =
    mirror.state.transport ?? (devices.list?.devices.find((d) => d.id === settings.lastDevice) ?? devices.list?.devices[0])?.transports[0]
  /** Open a whole-phone second screen for the phone in front (new window, app grid as its home). */
  const openSecondScreen = (app?: string): void => {
    const t = secondTarget
    if (!t) return void toast.error('Connect a phone first.')
    if (IS_HOST) void window.mobMirror.tabs.open({ serial: t.serial, kind: t.kind, second: true, ...(app ? { app } : {}) })
    else void window.mobMirror.openDeviceWindow(t.serial, t.kind, { second: true, ...(app ? { app } : {}) })
  }
  const popOutOrCompact = (): void => {
    if (EMBED) window.mobMirror.tabs.popOut()
    else updateSettings({ viewMode: 'compact' })
  }
  const activeTabInfo = tabsState.tabs.find((x) => x.id === editorTab)
  const tabSpecs: EditorTabSpec[] = [
    IS_HOST || !onPhoneNow
      ? { id: 'main', label: 'Welcome', kind: 'welcome' }
      : {
          id: 'main',
          label: phoneNameNow,
          kind: mirror.state.transport?.kind ?? 'phone',
          detail: mirror.state.transport ? (mirror.state.transport.kind === 'usb' ? 'USB' : 'Wi-Fi') : undefined,
          onClose: () => dispatch('disconnect'),
          closeLabel: 'Disconnect',
        },
    ...tabsState.tabs.map(
      (t): EditorTabSpec => ({
        id: t.id,
        label: t.title,
        kind: t.second ? 'second' : t.kind === 'usb' ? 'usb' : 'wifi',
        detail: t.kind === 'usb' ? 'USB' : 'Wi-Fi',
        onClose: () => window.mobMirror.tabs.close(t.id),
        closeLabel: t.second ? 'Close second screen' : 'Disconnect',
      }),
    ),
    ...(settingsTab ? [{ id: 'settings', label: 'Settings', kind: 'settings', onClose: closeSettingsTab, closeLabel: 'Close Settings' } as EditorTabSpec] : []),
  ]
  const frameButtons = frameSpec(settings.frame)?.buttons ?? 0
  const vw = mirror.state.stats?.width ?? 0
  const vh = mirror.state.stats?.height ?? 0
  const aspect = vw && vh ? Math.round((vw / vh) * 1000) / 1000 : 0 // rounded: only re-fit on real changes (rotation)
  useEffect(() => {
    const fx = frameExtra(frameSpec(settings.frame))
    const titleExtra = settings.frame !== 'none' ? FRAMED_TITLE - TITLE : 0
    if (compact && aspect)
      void window.mobMirror.setWindowLayout('compact', aspect, {
        width: fx.width,
        height: fx.height + titleExtra + (settings.navBar ? NAV_BAR_HEIGHT : 0),
      })
    else if (!compact) void window.mobMirror.setWindowLayout('full')
  }, [compact, aspect, settings.navBar, settings.frame])

  /** The toolbar owns the window's top-left corner (traffic lights) unless a docked sidebar is shown. */
  // Narrow windows: a docked sidebar would squash the mirror, so it floats over it instead.
  const narrow = useMediaQuery('(max-width: 899px)')
  const sidebarLayout = narrow ? 'floating' : settings.sidebarLayout
  sidebarLayoutRef.current = sidebarLayout
  // Side bar view (activity bar): clicking the shown view's icon again hides the side bar, like VS Code.
  const [sideView, setSideView] = useState<SideView>('phones')
  const pickView = (v: SideView): void => {
    if (settings.sidebarOpen && sideView === v) updateSettings({ sidebarOpen: false })
    else {
      setSideView(v)
      updateSettings({ sidebarOpen: true })
    }
  }
  // The selected phone tab's page sits over this area: keep main told where it is, and hide the page
  // while one of this window's menus, dialogs or popovers is open (a page would cover it).
  const editorRef = useRef<HTMLDivElement>(null)
  const tabShown = IS_HOST && workbench && editorTab !== 'main' && editorTab !== 'settings'
  useEffect(() => {
    if (!IS_HOST) return
    const el = editorRef.current
    if (!tabShown || !el) return void window.mobMirror.tabs.setBounds(null)
    const send = (): void => {
      const r = el.getBoundingClientRect()
      window.mobMirror.tabs.setBounds({ x: r.left, y: r.top, width: r.width, height: r.height })
    }
    send()
    const ro = new ResizeObserver(send)
    ro.observe(el)
    window.addEventListener('resize', send)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', send)
    }
  }, [tabShown, settings.sidebarOpen, settings.showStatusBar, sidebarLayout])
  useEffect(() => {
    if (!IS_HOST) return
    const sel = '[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"],[data-radix-popper-content-wrapper]'
    let last = false
    const check = (): void => {
      const now = document.querySelector(sel) !== null
      if (now !== last) window.mobMirror.tabs.setCovered((last = now))
    }
    const mo = new MutationObserver(check)
    mo.observe(document.body, { childList: true, subtree: true })
    return () => mo.disconnect()
  }, [])
  const phoneName = phoneNameNow
  const onPhone = onPhoneNow

  return (
    // Full view is VS Code's workbench: title bar, activity bar, side bar, editor, status bar (a grid).
    // Every piece is a conditional slot before <main>, so <main> keeps its place in the tree in both
    // views and the video canvas inside it is never remounted.
    <div
      className={cn(
        'relative h-full',
        compact ? 'flex' : EMBED ? 'flex flex-col bg-background' : 'grid grid-cols-[auto_auto_minmax(0,1fr)] overflow-hidden rounded-[12px] bg-background',
      )}
      style={workbench ? { gridTemplateRows: `${TITLE_BAR}px minmax(0,1fr) auto` } : undefined}
    >
      {workbench && (
        <div className="col-span-3 row-start-1">
          <TitleBar
            title={activeTabInfo ? `${activeTabInfo.title} — Twinglass` : onPhone ? `${phoneName} — Twinglass` : 'Twinglass'}
            onOpenPalette={() => (tabShown ? window.mobMirror.tabs.command('open-palette') : setPalette({ open: true, mode: 'all' }))}
            sidebarOpen={settings.sidebarOpen}
            onToggleSidebar={() => updateSettings({ sidebarOpen: !settings.sidebarOpen })}
            statusBarOpen={settings.showStatusBar}
            onToggleStatusBar={() => updateSettings({ showStatusBar: !settings.showStatusBar })}
            update={
              macUpdate?.latest
                ? {
                    label: `Update to ${macUpdate.latest}`,
                    detail: macUpdate.canInstall ? `Twinglass ${macUpdate.latest} installs in a few seconds and reopens (you have ${macUpdate.current}).` : `Download Twinglass ${macUpdate.latest} (you have ${macUpdate.current}).`,
                    onClick: () => startUpdate(macUpdate),
                  }
                : phoneUpdate
                  ? {
                      label: `Update phone app`,
                      detail: `Phone app ${phoneUpdate.bundled} for ${phoneUpdate.model}: installs over the cable or wireless debugging and keeps its settings.`,
                      onClick: () => updatePhoneApp(phoneUpdate),
                    }
                  : undefined
            }
          />
        </div>
      )}
      {workbench && (
        <ActivityBar
          view={sideView}
          sidebarOpen={settings.sidebarOpen}
          onView={pickView}
          phones={devices.list?.devices.length ?? 0}
          onSearch={() => (tabShown ? window.mobMirror.tabs.command('open-palette') : setPalette({ open: true, mode: 'all' }))}
          onClipboard={() => (tabShown ? window.mobMirror.tabs.command('open-clipboard') : setPalette({ open: true, mode: 'clipboard' }))}
          onSecondScreen={SECOND_SCREEN ? undefined : () => openSecondScreen()}
          onShortcuts={() => setHelpOpen(true)}
          onSettings={openSettings}
        />
      )}
      {workbench && (
        <Sidebar
          view={sideView}
          list={devices.list}
          error={devices.error}
          adb={devices.adb}
          refresh={devices.refresh}
          activeSerial={IS_HOST ? (activeTabInfo && !activeTabInfo.second ? activeTabInfo.serial : null) : (mirror.state.transport?.serial ?? null)}
          connecting={mirror.state.phase === 'connecting'}
          onMirror={onMirror}
          settings={settings}
          layout={sidebarLayout}
          layoutLocked={narrow}
          onSettingsChange={onSettingsChange}
        />
      )}
      {/* Compact: the phone is one rounded dark block; the rail floats beside it (see-through gap). */}
      {/* Pinned to its cell: a floating (absolute) side bar leaves the grid, and auto-placement would
          otherwise drop the editor into the side bar's narrow column. */}
      <main className={cn('flex min-w-0 flex-1 flex-col', compact && settings.frame === 'none' && 'overflow-hidden rounded-xl bg-stage', workbench && 'col-start-3 row-start-2 min-h-0', EMBED && 'min-h-0')}>
        {compact ? (
          <CompactTitleBar
            name={SECOND_SCREEN ? `${mirror.state.deviceName} · ${SECOND_SCREEN.agent ? 'Agent screen' : 'Second screen'}` : mirror.state.deviceName}
            transport={mirror.state.transport?.kind ?? null}
            floating={settings.frame !== 'none'}
            inset={frameSpec(settings.frame)?.buttons ?? 0}
          />
        ) : (
          // One slot (a fragment) so the stage below keeps its position in the tree.
          <>
            {workbench && <EditorTabs tabs={tabSpecs} active={editorTab} onSelect={selectTab} />}
            {onPhone && editorTab === 'main' && (
          <MirrorToolbar
            onCompact={live ? popOutOrCompact : undefined}
            mirror={mirror}
            onAction={dispatch}
            onShowHelp={() => setHelpOpen(true)}
            onOpenSettings={openSettings}
            onOpenPalette={() => setPalette({ open: true, mode: 'all' })}
            onSecondScreen={SECOND_SCREEN ? undefined : () => openSecondScreen()}
            onOpenApps={SECOND_SCREEN ? () => setGridOpen(true) : undefined}
          />
            )}
          </>
        )}
        {/* Same tree position in both views: the decoder is bound to this canvas. */}
        <div ref={editorRef} className="relative flex min-h-0 flex-1">
          {/* Lazy overlays get their own boundary: the canvas below must never suspend/unmount. */}
          <Suspense fallback={null}>
            {/* The Settings tab covers the stage; the mirror keeps running underneath. */}
            {workbench && settingsTab && editorTab === 'settings' && (
              <div className="absolute inset-0 z-30">
                <SettingsDialog
                  asTab
                  open
                  onOpenChange={(o) => !o && closeSettingsTab()}
                  settings={settings}
                  onSettingsChange={onSettingsChange}
                  adb={devices.adb}
                  refreshDevices={devices.refresh}
                  live={live}
                  narrow={narrow}
                  onReset={() => onSettingsChange({ ...DEFAULT_SETTINGS, lastDevice: settings.lastDevice })}
                />
              </div>
            )}
            {switcherOpen && live && (
              <AppSwitcher
                onClose={() => setSwitcherOpen(false)}
                onAllApps={() => {
                  setSwitcherOpen(false)
                  setGridOpen(true)
                }}
              />
            )}
            {gridOpen && live && (
              <AppGrid onClose={() => setGridOpen(false)} phoneName={mirror.state.deviceName || 'the phone'} serial={mirror.state.transport?.serial} />
            )}
          </Suspense>
          <MirrorStage
            canvasRef={canvasRef}
            overlayRef={overlayRef}
            phase={mirror.state.phase}
            recording={mirror.state.recordingSince !== null}
            locked={mirror.state.locked === true}
            appPrompt={mirror.state.appPrompt}
            onUnlock={() => dispatch('unlock')}
            onTypePin={() => dispatch('unlockManual')}
            frame={frameSpec(settings.frame)}
            frameColor={settings.frameColor}
            aspect={vw && vh ? vw / vh : 0}
            fit={compact}
            onAction={dispatch}
            onFrameRect={setPhoneRect}
            reconnect={mirror.state.reconnect}
          dropFolder={settings.dropFolder}
            idleContent={
              EMBED ? (
                <EmbedIdle name={mirror.state.deviceName} onRetry={() => { const t = autoConnectTarget(); if (t) onMirror(t) }} onClose={() => window.mobMirror.tabs.closeSelf()} />
              ) : (
              <Suspense fallback={null}>
                <ConnectPanel
                  list={devices.list}
                  error={devices.error}
                  adb={devices.adb}
                  refresh={devices.refresh}
                  connecting={mirror.state.phase === 'connecting'}
                  lastDevice={settings.lastDevice}
                  onMirror={onMirror}
                  onOpenPalette={() => setPalette({ open: true, mode: 'all' })}
                  onOpenClipboard={() => setPalette({ open: true, mode: 'clipboard' })}
                  onOpenSettings={openSettings}
                  onShowHelp={() => setHelpOpen(true)}
                  // A whole phone, directly: its own home screen (app grid) with every app.
                  onSecondScreen={() => openSecondScreen()}
                  recentDevices={settings.recentDevices}
                  autoConnect={settings.autoConnect}
                  onAutoConnectChange={(on) => updateSettings({ autoConnect: on })}
                  frame={settings.frame}
                  frameColor={settings.frameColor}
                />
              </Suspense>
              )
            }
          />
        </div>
        {compact && settings.navBar && !framed && <NavBar onAction={dispatch} disabled={!live} />}
        {/* Framed: the dock attaches right under the phone body (absolute), this keeps its room. */}
        {compact && settings.navBar && framed && <div aria-hidden className="shrink-0" style={{ height: NAV }} />}
      </main>
      {workbench && settings.showStatusBar && (
        <div className="col-span-3 row-start-3">
          <StatusBar
            state={mirror.state}
            phones={devices.list?.devices.length ?? 0}
            adb={devices.adb}
            onRemote={() => pickView('phones')}
            tab={activeTabInfo ? { title: activeTabInfo.title, kind: activeTabInfo.kind === 'usb' ? 'usb' : 'wifi', stats: tabStats[activeTabInfo.id] } : undefined}
          />
        </div>
      )}
      {/* The see-through strip between phone and rail: also a handle to move the window. */}
      {compact && <div aria-hidden className="shrink-0 [-webkit-app-region:drag]" style={{ width: GAP }} />}
      {compact && (
        <ControlRail
          // With a phone frame, line the strip up with the phone body (below the title pills,
          // above the nav dock) so the pieces read as one layout.
          // Framed: exactly as tall as the phone body, GAP after its side buttons.
          className={framed && phoneRect ? 'self-start' : undefined}
          style={
            framed && phoneRect
              ? {
                  marginTop: phoneRect.y,
                  height: phoneRect.height,
                  transform: `translateX(${phoneRect.x + phoneRect.width + frameButtons + GAP - (viewportW - RAIL_WIDTH)}px)`,
                }
              : framed
                ? {
                    marginTop: FRAMED_TITLE,
                    marginBottom: settings.navBar ? NAV : 0,
                  }
                : undefined
          }
          mirror={mirror}
          onAction={dispatch}
          onShowHelp={() => setHelpOpen(true)}
          onOpenSettings={openSettings}
          onOpenPalette={() => setPalette({ open: true, mode: 'all' })}
          onOpenApps={SECOND_SCREEN ? () => setGridOpen(true) : undefined}
          onSecondScreen={SECOND_SCREEN ? undefined : openSecondScreen}
          onFullView={() => {
            setForceCompact(false)
            updateSettings({ viewMode: 'full' })
          }}
        />
      )}
      {framed && settings.navBar && phoneRect && (
        <div
          className="absolute"
          style={{
            top: phoneRect.y + phoneRect.height,
            left: phoneRect.x,
            width: phoneRect.width,
          }}
        >
          <NavBar onAction={dispatch} disabled={!live} floating />
        </div>
      )}
      <Suspense fallback={null}>
        {helpMounted && <ControlsHelp open={helpOpen} onOpenChange={setHelpOpen} />}
        {paletteMounted && (
          <CommandPalette
            open={palette.open}
            mode={palette.mode}
            onOpenChange={(open) => setPalette((p) => ({ ...p, open }))}
            live={live}
            onAction={dispatch}
            phoneSerial={secondTarget?.serial}
            onPickSecondScreen={() => setPalette({ open: true, mode: 'second' })}
            onOpenSecondScreen={(app) => openSecondScreen(app)}
          />
        )}
        {detailsRequest && <PhoneDetailsDialog request={detailsRequest} />}
        {settingsMounted && (
          <SettingsDialog
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
            settings={settings}
            onSettingsChange={onSettingsChange}
            adb={devices.adb}
            refreshDevices={devices.refresh}
            live={live}
            narrow={narrow}
            onReset={() =>
              onSettingsChange({
                ...DEFAULT_SETTINGS,
                lastDevice: settings.lastDevice,
              })
            }
          />
        )}
        {unlockMounted && <UnlockDialog open={unlockOpen} onOpenChange={setUnlockOpen} initialError={unlockError} requireTouchId={settings.requireTouchId} />}
      </Suspense>
    </div>
  )
}

/** A tab page whose mirror isn't running (it failed, or the phone went away): retry or close the tab. */
function EmbedIdle({ name, onRetry, onClose }: { name: string; onRetry: () => void; onClose: () => void }): ReactNode {
  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <p className="text-[13px] font-semibold">{name ? `${name} isn’t mirrored` : 'Not mirrored'}</p>
        <div className="flex gap-2">
          <Button size="sm" onClick={onRetry}>
            Reconnect
          </Button>
          <Button size="sm" variant="secondary" onClick={onClose}>
            Close tab
          </Button>
        </div>
      </div>
    </div>
  )
}
