import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { TransportInfo } from '../../preload/api'
import { ControlsHelp } from '@/components/controls-help'
import { MirrorStage } from '@/components/mirror-stage'
import { MirrorToolbar } from '@/components/mirror-toolbar'
import { Sidebar } from '@/components/sidebar'
import { StatusBar } from '@/components/status-bar'
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
  const { connect, runAction } = mirror

  const onMirror = useCallback(
    (t: TransportInfo) => void connect(t, { audio: settings.audio, showTouches: settings.showTouches }),
    [connect, settings.audio, settings.showTouches],
  )

  // Device menu shortcuts (⌘B back, ⇧⌘H home, …) arrive from main for the focused window.
  useEffect(() => window.mobMirror.onDeviceAction(runAction), [runAction])

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
        onSettingsChange={updateSettings}
      />
      <main className="flex min-w-0 flex-1 flex-col">
        <MirrorToolbar mirror={mirror} onShowHelp={() => setHelpOpen(true)} />
        <MirrorStage
          canvasRef={canvasRef}
          overlayRef={overlayRef}
          phase={mirror.state.phase}
          recording={mirror.state.recordingSince !== null}
        />
        <StatusBar state={mirror.state} />
      </main>
      <ControlsHelp open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  )
}
