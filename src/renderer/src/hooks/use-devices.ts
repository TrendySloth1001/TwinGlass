import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { AdbStatusInfo, DeviceListInfo } from '../../../preload/api'

export function useDevices(): {
  list: DeviceListInfo | null
  error: string | null
  adb: AdbStatusInfo | null
  refresh: () => void
} {
  const [list, setList] = useState<DeviceListInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adb, setAdb] = useState<AdbStatusInfo | null>(null)

  const refresh = useCallback(() => {
    window.mobMirror.listDevices().then(
      (l) => {
        setList(l)
        setError(null)
      },
      (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
    )
  }, [])

  useEffect(() => {
    const off = window.mobMirror.onDevicesChanged(setList)
    refresh()
    void window.mobMirror.adbStatus().then(setAdb)
    return off
  }, [refresh])

  // An older adb server started by another tool: tell the user once, as an in-app notification,
  // with a one-click fix (restart the server with this app's adb).
  const noticeShown = useRef(false)
  useEffect(() => {
    if (!adb?.serverVersion || !adb.clientVersion || adb.serverVersion === adb.clientVersion || noticeShown.current) return
    noticeShown.current = true
    toast.warning(`adb server ${adb.serverVersion} is running`, {
      description: `Another tool started an older adb than this app’s ${adb.clientVersion}. Wireless pairing can misbehave until it’s restarted.`,
      duration: Infinity,
      action: {
        label: 'Restart adb server',
        onClick: () => {
          const id = toast.loading('Restarting the adb server…')
          window.mobMirror.restartAdbServer().then(
            (s) => {
              setAdb(s)
              refresh()
              toast.success(`adb server ${s.serverVersion ?? ''} running`, { id, description: 'Phones reconnect automatically.' })
            },
            (e: unknown) => toast.error('Could not restart adb', { id, description: String(e) }),
          )
        },
      },
    })
  }, [adb, refresh])

  return { list, error, adb, refresh }
}
