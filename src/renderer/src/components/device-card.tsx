import { AppWindow, EllipsisVertical, Loader2, Play, Unplug, Usb, Wifi } from 'lucide-react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import type { DeviceInfo, OpResult, TransportInfo } from '../../../preload/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

interface DeviceCardProps {
  device: DeviceInfo
  /** Serial of the transport currently mirrored in this window, if any. */
  activeSerial: string | null
  connecting: boolean
  onMirror: (t: TransportInfo) => void
}

async function run(label: string, op: () => Promise<OpResult>): Promise<void> {
  const id = toast.loading(`${label}…`)
  try {
    const r = await op()
    if (r.ok) toast.success(label, { id, description: r.message })
    else toast.error(`${label} failed`, { id, description: r.message })
  } catch (e) {
    toast.error(`${label} failed`, { id, description: String(e) })
  }
}

const isIpSerial = (s: string): boolean => /^[\d.]+:\d+$/.test(s)

export function DeviceCard({ device, activeSerial, connecting, onMirror }: DeviceCardProps): ReactNode {
  const hasWifi = device.transports.some((t) => t.kind === 'wifi')
  return (
    <Card className="min-w-0 gap-2 p-3 shadow-none">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-semibold">{device.model}</span>
        {device.sdk && (
          <Badge variant="secondary" className="font-mono text-[10px]">
            API {device.sdk}
          </Badge>
        )}
      </div>
      <div className="flex flex-col gap-1">
        {device.transports.map((t, i) => {
          const active = activeSerial === t.serial
          return (
            <div
              key={t.serial}
              className={cn(
                'group flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-accent',
                active && 'bg-accent',
              )}
            >
              {t.kind === 'usb' ? (
                <Usb className="size-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <Wifi className="size-3.5 shrink-0 text-muted-foreground" />
              )}
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={t.serial}>
                {t.serial}
              </span>
              <Button
                size="xs"
                variant={i === 0 && !active ? 'default' : 'outline'}
                disabled={connecting || active}
                onClick={() => onMirror(t)}
              >
                {connecting && active ? <Loader2 className="animate-spin" /> : <Play />}
                {active ? 'Live' : 'Mirror'}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon-xs" variant="ghost" aria-label="More actions">
                    <EllipsisVertical />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => void window.mobMirror.openDeviceWindow(t.serial, t.kind)}>
                    <AppWindow /> Mirror in new window
                  </DropdownMenuItem>
                  {t.kind === 'usb' && !hasWifi && (
                    <DropdownMenuItem
                      onSelect={() => void run('Switching to Wi-Fi', () => window.mobMirror.enableTcpip(t.serial))}
                    >
                      <Wifi /> Switch to Wi-Fi (adb tcpip)
                    </DropdownMenuItem>
                  )}
                  {t.kind === 'wifi' && isIpSerial(t.serial) && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => void run('Disconnecting', () => window.mobMirror.disconnect(t.serial))}
                      >
                        <Unplug /> Disconnect Wi-Fi
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
