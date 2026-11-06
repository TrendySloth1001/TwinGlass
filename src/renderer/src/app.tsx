import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import type { TransportInfo } from '../../preload/api'
import { ControlsHelp } from '@/components/controls-help'
import { MirrorStage } from '@/components/mirror-stage'
import { MirrorToolbar } from '@/components/mirror-toolbar'
import { Sidebar } from '@/components/sidebar'
import { StatusBar } from '@/components/status-bar'
import { UnlockDialog } from '@/components/unlock-dialog'
import type { DeviceAction } from '@shared/shortcuts'
import { useDevices } from '@/hooks/use-devices'
import { useMirror } from '@/hooks/use-mirror'
import { useSettings } from '@/hooks/use-settings'

/** Windows opened via "Mirror in new window" carry #connect=<serial>&kind=<usb|wifi>. */
function autoConnectTarget(): TransportInfo | null {
  const h = new URLSearchParams(location.hash.slice(1))
  const serial = h.get('connect')
  const kind = h.get('kind')
  if (!serial || (kind !== 'usb' && kind !== 'wifi')) return null
  return { serial, kind, state: 'device' }
}

export function App(): ReactNode {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const devices = useDevices()
  const mirror = useMirror(canvasRef, overlayRef)
  const [settings, updateSettings] = useSettings()
  const [helpOpen, setHelpOpen] = useState(false)
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
      if (st.locked === false) {
        await window.mobMirror.unlock({}) // just wakes the screen
        toast('The phone is already unlocked')
        return
      }
      if (st.saved && st.touchId && st.credential !== 'PATTERN') {
        const id = toast.loading('Unlocking… confirm with Touch ID')
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
      if (action === 'unlock') {
        if (live) void quickUnlock()
      } else runAction(action)
    },
    [live, quickUnlock, runAction],
  )

  const onMirror = useCallback(
    (t: TransportInfo, deviceId?: string) =>
      void connect(t, {
        audio: settings.audio,
        showTouches: settings.showTouches,
        quality: settings.quality,
        codec: settings.codec,
        deviceId,
      }),
    [connect, settings.audio, settings.showTouches, settings.quality, settings.codec],
  )

  /** Session settings apply immediately: restart a live mirror with the new values. */
  const { restart } = mirror
  const onSettingsChange = useCallback(
    (patch: Partial<typeof settings>) => {
      updateSettings(patch)
      void restart(patch)
    },
    [restart, updateSettings],
  )

  // Device menu shortcuts (⌘B back, ⇧⌘H home, …) arrive from main for the focused window.
  useEffect(() => window.mobMirror.onDeviceAction(dispatch), [dispatch])
  // The session ended: a dialog about the phone makes no sense anymore.
  useEffect(() => {
    if (!live) setUnlockOpen(false)
  }, [live])

  const autoConnected = useRef(false)
  useEffect(() => {
    const target = autoConnectTarget()
    if (target && !autoConnected.current) {
      autoConnected.current = true
      onMirror(target)
    }
  }, [onMirror])

  return (
    <div className="flex h-full">
      <Sidebar
        list={devices.list}
        error={devices.error}
        adb={devices.adb}
        refresh={devices.refresh}
        activeSerial={mirror.state.transport?.serial ?? null}
        connecting={mirror.state.phase === 'connecting'}
        onMirror={onMirror}
        settings={settings}
        onSettingsChange={onSettingsChange}
      />
      <main className="flex min-w-0 flex-1 flex-col">
        <MirrorToolbar mirror={mirror} onAction={dispatch} onShowHelp={() => setHelpOpen(true)} />
        <MirrorStage
          canvasRef={canvasRef}
          overlayRef={overlayRef}
          phase={mirror.state.phase}
          recording={mirror.state.recordingSince !== null}
          locked={mirror.state.locked === true}
          onUnlock={() => dispatch('unlock')}
          reconnect={mirror.state.reconnect}
        />
        <StatusBar state={mirror.state} />
      </main>
      <ControlsHelp open={helpOpen} onOpenChange={setHelpOpen} />
      <UnlockDialog open={unlockOpen} onOpenChange={setUnlockOpen} initialError={unlockError} />
    </div>
  )
}
