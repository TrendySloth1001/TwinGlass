import { useCallback, useEffect, useRef, type ReactNode } from 'react'
import type { TransportInfo } from '../../preload/api'
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
  const devices = useDevices()
  const mirror = useMirror(canvasRef)
  const [settings, updateSettings] = useSettings()
  const { connect } = mirror

  const onMirror = useCallback((t: TransportInfo) => void connect(t, settings.audio), [connect, settings.audio])

  const autoConnected = useRef(false)
  useEffect(() => {
    const target = autoConnectTarget()
    if (target && !autoConnected.current) {
      autoConnected.current = true
      void connect(target, settings.audio)
    }
  }, [connect, settings.audio])

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
        audio={settings.audio}
        onAudioChange={(audio) => updateSettings({ audio })}
      />
      <main className="flex min-w-0 flex-1 flex-col">
        <MirrorToolbar mirror={mirror} />
        <MirrorStage canvasRef={canvasRef} phase={mirror.state.phase} recording={mirror.state.recordingSince !== null} />
        <StatusBar state={mirror.state} />
      </main>
    </div>
  )
}
