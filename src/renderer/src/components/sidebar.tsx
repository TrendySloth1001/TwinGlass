import { AlertTriangle, Plus, RefreshCw, Smartphone } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { AudioMode } from '@shared/ipc'
import type { AdbStatusInfo, DeviceListInfo, TransportInfo } from '../../../preload/api'
import { AddDeviceDialog } from '@/components/add-device-dialog'
import { DeviceCard } from '@/components/device-card'
import { IconButton } from '@/components/icon-button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import type { Settings } from '@/hooks/use-settings'

interface SidebarProps {
  list: DeviceListInfo | null
  error: string | null
  adb: AdbStatusInfo | null
  refresh: () => void
  activeSerial: string | null
  connecting: boolean
  onMirror: (t: TransportInfo) => void
  settings: Settings
  onSettingsChange: (patch: Partial<Settings>) => void
}

function stateHint(state: string): string {
  if (state === 'unauthorized') return 'Accept "Allow USB debugging?" on the phone.'
  if (state === 'offline') return 'Unlock the phone, or replug / re-enable wireless debugging.'
  return ''
}

export function Sidebar(p: SidebarProps): ReactNode {
  const [adding, setAdding] = useState(false)
  const versionMismatch = p.adb?.serverVersion && p.adb.clientVersion && p.adb.serverVersion !== p.adb.clientVersion

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r bg-sidebar">
      {/* Title bar area: draggable, leaves room for the macOS traffic lights. */}
      <header className="flex h-12 items-center justify-end gap-1 pr-2 pl-20 [-webkit-app-region:drag]">
        <span className="mr-auto text-sm font-semibold tracking-tight">Mob Mirror</span>
        <IconButton label="Refresh devices" onClick={p.refresh}>
          <RefreshCw />
        </IconButton>
      </header>

      {/* Plain overflow container: Radix ScrollArea's display:table wrapper defeats text truncation. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex min-w-0 flex-col gap-2 p-3">
          {p.error && (
            <Alert variant="destructive">
              <AlertTriangle />
              <AlertDescription>{p.error}</AlertDescription>
            </Alert>
          )}
          {p.list && p.list.devices.length === 0 && p.list.other.length === 0 && (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
              <Smartphone className="size-6" />
              Plug in a phone with USB debugging on, or add a wireless device.
            </div>
          )}
          {p.list?.devices.map((d) => (
            <DeviceCard
              key={d.id}
              device={d}
              activeSerial={p.activeSerial}
              connecting={p.connecting}
              onMirror={p.onMirror}
            />
          ))}
          {p.list?.other.map((t) => (
            <div key={t.serial} className="rounded-lg border border-dashed p-3 text-xs">
              <div className="truncate font-medium">{t.serial}</div>
              <div className="text-muted-foreground">
                {t.state}. {stateHint(t.state)}
              </div>
            </div>
          ))}
          <Button variant="outline" className="mt-1 w-full" onClick={() => setAdding(true)}>
            <Plus /> Add wireless device
          </Button>
        </div>
      </div>

      <Separator />
      <div className="flex flex-col gap-3 p-3">
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          Session settings · apply on next connect
        </p>
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="show-touches" className="text-xs font-normal">
            Show touches on phone
          </Label>
          <Switch
            id="show-touches"
            checked={p.settings.showTouches}
            onCheckedChange={(v) => p.onSettingsChange({ showTouches: v })}
          />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs font-normal">Audio</Label>
          <Select value={p.settings.audio} onValueChange={(v) => p.onSettingsChange({ audio: v as AudioMode })}>
            <SelectTrigger size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="off">Off</SelectItem>
              <SelectItem value="mac">Play on this Mac (phone muted)</SelectItem>
              <SelectItem value="both">Mac + phone (Android 13+)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {versionMismatch && (
          <Alert className="border-warning/40 text-xs">
            <AlertTriangle className="text-warning" />
            <AlertTitle>adb server {p.adb!.serverVersion} is running</AlertTitle>
            <AlertDescription className="text-xs">
              <p>
                This app uses adb {p.adb!.clientVersion}; another tool started the server (
                <span className="break-all">{p.adb!.serverPath}</span>). If
                wireless pairing misbehaves, quit that tool and run <code className="font-mono">adb kill-server</code>.
              </p>
            </AlertDescription>
          </Alert>
        )}
        <p className="truncate text-[11px] text-muted-foreground" title={p.adb?.adbPath ?? ''}>
          {p.adb?.adbPath ? `adb ${p.adb.clientVersion ?? ''} · ${p.adb.adbPath}` : 'adb not found: brew install android-platform-tools'}
        </p>
      </div>

      <AddDeviceDialog open={adding} onOpenChange={setAdding} />
    </aside>
  )
}
