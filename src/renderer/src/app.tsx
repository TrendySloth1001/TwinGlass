import { cn } from '@/lib/utils'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import type { TransportInfo } from '../../preload/api'
import { ControlsHelp } from '@/components/controls-help'
import { CompactTitleBar } from '@/components/compact-title-bar'
import { ConnectPanel } from '@/components/connect-panel'
import { AppGrid } from '@/components/app-grid'
import { ControlRail } from '@/components/control-rail'
import { CommandPalette, type PaletteMode } from '@/components/command-palette'
import { MirrorStage, type PhoneRect } from '@/components/mirror-stage'
import { NAV_BAR_HEIGHT, NavBar } from '@/components/nav-bar'
import { frameExtra, frameSpec } from '@/lib/phone-frames'
import { FRAMED_TITLE, GAP, NAV, RAIL_WIDTH, TITLE } from '@shared/compact-layout'
import { SettingsDialog } from '@/components/settings-dialog'
import { applyTheme } from '@/hooks/use-theme'
import { notify, setPopups } from '@/lib/notify'
import { MirrorToolbar } from '@/components/mirror-toolbar'
import { Sidebar } from '@/components/sidebar'
import { StatusBar } from '@/components/status-bar'
import { UnlockDialog } from '@/components/unlock-dialog'
import type { DeviceAction } from '@shared/shortcuts'
import { useDevices } from '@/hooks/use-devices'
import { useMirror } from '@/hooks/use-mirror'
import { useMediaQuery } from '@/hooks/use-media-query'
import { DEFAULT_SETTINGS, STREAM_KEYS, useSettings } from '@/hooks/use-settings'

/** Windows opened via "Mirror in new window" carry #connect=<serial>&kind=<usb|wifi>. */
function autoConnectTarget(): TransportInfo | null {
  const h = new URLSearchParams(location.hash.slice(1))
  const serial = h.get('connect')
  const kind = h.get('kind')
  if (!serial || (kind !== 'usb' && kind !== 'wifi')) return null
  return { serial, kind, state: 'device' }
}

/** Second-screen windows carry #…&screen=second&app=<pkg> (a new virtual display, not the phone's screen). */
const SECOND_SCREEN: { app?: string } | null = (() => {
  const h = new URLSearchParams(location.hash.slice(1))
  if (h.get('screen') !== 'second') return null
  const app = h.get('app')
  return app && /^[\w.]+$/.test(app) ? { app } : {}
})()

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
  /** Second screen's app grid (its home screen). */
  const [gridOpen, setGridOpen] = useState(false)
  const [palette, setPalette] = useState<{ open: boolean; mode: PaletteMode }>({ open: false, mode: 'all' })
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
      } else {
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
      void connect(t, {
        audio: settings.audio,
        showTouches: settings.showTouches,
        quality: settings.quality,
        codec: settings.codec,
        maxFps: settings.maxFps,
        stayAwake: settings.stayAwake,
        clipboardSync: settings.clipboardSync,
        secondScreen: SECOND_SCREEN ?? undefined,
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
        if (cmd === 'open-settings') setSettingsOpen(true)
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
        }
        else if (cmd === 'toggle-view') updateSettings({ viewMode: s.viewMode === 'compact' ? 'full' : 'compact' })
        else if (cmd === 'toggle-sidebar') updateSettings({ sidebarOpen: !s.sidebarOpen })
        else updateSettings({ sidebarLayout: s.sidebarLayout === 'floating' ? 'docked' : 'floating', sidebarOpen: true })
      }),
    [updateSettings],
  )
  useEffect(() => applyTheme(settings.theme), [settings.theme])
  // A whole-phone second screen (no specific app) opens on its home screen: the app grid.
  const gridShownOnce = useRef(false)
  useEffect(() => {
    if (SECOND_SCREEN && !SECOND_SCREEN.app && live && !gridShownOnce.current) {
      gridShownOnce.current = true
      setGridOpen(true)
    }
    if (!live) setGridOpen(false)
  }, [live])
  useEffect(() => void window.mobMirror.setTrayVisible(settings.showTray).catch(() => {}), [settings.showTray])
  useEffect(() => void window.mobMirror.setClipboardHistoryEnabled(settings.clipboardHistory).catch(() => {}), [settings.clipboardHistory])
  // The menu bar icon asked this window to mirror a phone.
  useEffect(() => window.mobMirror.onConnectRequest((t) => onMirror({ ...t, state: 'device' })), [onMirror])
  useEffect(
    () =>
      window.mobMirror.onUpdateAvailable((u) =>
        notify('info', `Twinglass ${u.latest} is available`, {
          description: `You have ${u.current}. Download it and drag it into Applications (automatic install needs a signed app).`,
          action: u.url ? { label: 'Download', run: () => void window.mobMirror.downloadUpdate(u.url!) } : undefined,
        }),
      ),
    [],
  )
  useEffect(() => window.mobMirror.onAppError((m) => notify('error', 'Something went wrong in the background', { description: m })), [])
  useEffect(() => void window.mobMirror.setRequireTouchId(settings.requireTouchId).catch(() => {}), [settings.requireTouchId])
  const { setInputOptions, setAutoReconnect } = mirror
  useEffect(() => setAutoReconnect(settings.autoReconnect), [setAutoReconnect, settings.autoReconnect])
  useEffect(() => setPopups(settings.popups), [settings.popups])
  useEffect(
    () => setInputOptions({ mouseShortcuts: settings.mouseShortcuts, invertScroll: settings.invertScroll, scrollSpeed: settings.scrollSpeed }),
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
  const compact = settings.viewMode === 'compact' && (mirror.state.phase === 'live' || mirror.state.phase === 'reconnecting')
  const framed = compact && settings.frame !== 'none'
  // Phone a second screen opens on: the mirrored one, else the home screen's first phone.
  const secondTarget: TransportInfo | undefined =
    mirror.state.transport ?? (devices.list?.devices.find((d) => d.id === settings.lastDevice) ?? devices.list?.devices[0])?.transports[0]
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
  const toolbarOwnsCorner = sidebarLayout === 'floating' || !settings.sidebarOpen

  return (
    <div className={cn('relative flex h-full', !compact && 'overflow-hidden rounded-[12px] bg-background')}>
      {!compact && (
      <Sidebar
        list={devices.list}
        error={devices.error}
        adb={devices.adb}
        refresh={devices.refresh}
        activeSerial={mirror.state.transport?.serial ?? null}
        connecting={mirror.state.phase === 'connecting'}
        onMirror={onMirror}
        settings={settings}
        layout={sidebarLayout}
        layoutLocked={narrow}
        onSettingsChange={onSettingsChange}
      />
      )}
      {/* Compact: the phone is one rounded dark block; the rail floats beside it (see-through gap). */}
      <main className={cn('flex min-w-0 flex-1 flex-col', compact && settings.frame === 'none' && 'overflow-hidden rounded-xl bg-stage')}>
        {compact ? (
          <CompactTitleBar
            name={SECOND_SCREEN ? `${mirror.state.deviceName} · Second screen` : mirror.state.deviceName}
            transport={mirror.state.transport?.kind ?? null}
            floating={settings.frame !== 'none'}
            inset={frameSpec(settings.frame)?.buttons ?? 0}
          />
        ) : (
        <MirrorToolbar
          onCompact={live ? () => updateSettings({ viewMode: 'compact' }) : undefined}
          mirror={mirror}
          onAction={dispatch}
          onShowHelp={() => setHelpOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenPalette={() => setPalette({ open: true, mode: 'all' })}
          ownsCorner={toolbarOwnsCorner}
          sidebarOpen={settings.sidebarOpen}
          onToggleSidebar={() => updateSettings({ sidebarOpen: !settings.sidebarOpen })}
        />
        )}
        {/* Same tree position in both views: the decoder is bound to this canvas. */}
        <div className="relative flex min-h-0 flex-1">
          {gridOpen && live && <AppGrid onClose={() => setGridOpen(false)} phoneName={mirror.state.deviceName || 'the phone'} />}
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
          idleContent={
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
              onOpenSettings={() => setSettingsOpen(true)}
              onShowHelp={() => setHelpOpen(true)}
              onSecondScreen={() => {
                // A whole phone, directly: its own home screen (app grid) with every app.
                if (secondTarget) void window.mobMirror.openDeviceWindow(secondTarget.serial, secondTarget.kind, { second: true })
              }}
              recentDevices={settings.recentDevices}
              autoConnect={settings.autoConnect}
              onAutoConnectChange={(on) => updateSettings({ autoConnect: on })}
              frame={settings.frame}
              frameColor={settings.frameColor}
            />
          }
        />
        </div>
        {compact && settings.navBar && !framed && <NavBar onAction={dispatch} disabled={!live} />}
        {/* Framed: the dock attaches right under the phone body (absolute), this keeps its room. */}
        {compact && settings.navBar && framed && <div aria-hidden className="shrink-0" style={{ height: NAV }} />}
        {!compact && settings.showStatusBar && <StatusBar state={mirror.state} />}
      </main>
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
                ? { marginTop: FRAMED_TITLE, marginBottom: settings.navBar ? NAV : 0 }
                : undefined
          }
          mirror={mirror}
          onAction={dispatch}
          onShowHelp={() => setHelpOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenPalette={() => setPalette({ open: true, mode: 'all' })}
          onOpenApps={SECOND_SCREEN ? () => setGridOpen(true) : undefined}
          onFullView={() => updateSettings({ viewMode: 'full' })}
        />
      )}
      {framed && settings.navBar && phoneRect && (
        <div className="absolute" style={{ top: phoneRect.y + phoneRect.height, left: phoneRect.x, width: phoneRect.width }}>
          <NavBar onAction={dispatch} disabled={!live} floating />
        </div>
      )}
      <ControlsHelp open={helpOpen} onOpenChange={setHelpOpen} />
      <CommandPalette
        open={palette.open}
        mode={palette.mode}
        onOpenChange={(open) => setPalette((p) => ({ ...p, open }))}
        live={live}
        onAction={dispatch}
        phoneSerial={secondTarget?.serial}
        onPickSecondScreen={() => setPalette({ open: true, mode: 'second' })}
        onOpenSecondScreen={(app) => {
          if (!secondTarget) return toast.error('Connect a phone first.')
          void window.mobMirror.openDeviceWindow(secondTarget.serial, secondTarget.kind, { second: true, app })
        }}
      />
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
        onSettingsChange={onSettingsChange}
        adb={devices.adb}
        refreshDevices={devices.refresh}
        live={live}
        narrow={narrow}
        onReset={() => onSettingsChange({ ...DEFAULT_SETTINGS, lastDevice: settings.lastDevice })}
      />
      <UnlockDialog open={unlockOpen} onOpenChange={setUnlockOpen} initialError={unlockError} requireTouchId={settings.requireTouchId} />
    </div>
  )
}
