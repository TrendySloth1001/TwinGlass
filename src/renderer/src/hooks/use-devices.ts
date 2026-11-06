import { useCallback, useEffect, useState } from 'react'
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

  return { list, error, adb, refresh }
}
