import { AppWindow, Ellipsis, Info, Loader2, Play, Smartphone, Unplug, Usb, Wifi } from 'lucide-react'
import { showPhoneDetails } from '@/lib/phone-details'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import type { DeviceInfo, OpResult, TransportInfo } from '../../../preload/api'
import { Button } from '@/components/ui/button'
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
  onMirror: (t: TransportInfo, deviceId: string) => void
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
  // A tree like VS Code's explorer: the phone, then one row per way to reach it (USB, Wi-Fi), with
  // inline actions. The mirrored row is selected.
  return (
    <div role="tree" aria-label={device.model} className="-mx-3 min-w-0 text-[13px]">
      <div className="flex h-[22px] items-center gap-1.5 pr-3 pl-4">
        <Smartphone className="size-4 shrink-0 text-link" />
        <span className="truncate text-foreground">{device.model}</span>
        {device.sdk && <span className="shrink-0 text-[12px] text-muted-foreground">API {device.sdk}</span>}
      </div>
      {device.transports.map((t) => {
        const active = activeSerial === t.serial
        return (
          <div
            key={t.serial}
            role="treeitem"
            aria-selected={active}
            onDoubleClick={() => !connecting && !active && onMirror(t, device.id)}
            className={cn('group flex h-[22px] items-center gap-1.5 pr-2 pl-9 hover:bg-accent', active && 'bg-selection hover:bg-selection')}
          >
            {t.kind === 'usb' ? <Usb className="size-3.5 shrink-0 text-muted-foreground" /> : <Wifi className="size-3.5 shrink-0 text-muted-foreground" />}
            <span className="min-w-0 flex-1 truncate text-muted-foreground" title={t.serial}>
              {t.kind === 'usb' ? 'USB' : 'Wi-Fi'} <span className="text-[12px] opacity-70">{t.serial}</span>
            </span>
            {active ? (
              <span className="flex shrink-0 items-center gap-1 text-[11px] text-success">
                {connecting ? <Loader2 className="size-3 animate-spin" /> : <span className="size-1.5 rounded-full bg-success" />}
                Live
              </span>
            ) : (
              <Button
                size="icon-xs"
                variant="ghost"
                title="Mirror (or double-click)"
                aria-label={`Mirror over ${t.kind === 'usb' ? 'USB' : 'Wi-Fi'}`}
                disabled={connecting}
                onClick={() => onMirror(t, device.id)}
                className="text-foreground [&_svg]:size-4"
              >
                <Play />
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon-xs" variant="ghost" aria-label="More actions" className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 [&_svg]:size-4">
                  <Ellipsis />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => void window.mobMirror.openDeviceWindow(t.serial, t.kind)}>
                  <AppWindow /> Mirror in new window
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => showPhoneDetails(t.serial, device.model)}>
                  <Info /> Phone details
                </DropdownMenuItem>
                {t.kind === 'usb' && !hasWifi && (
                  <DropdownMenuItem onSelect={() => void run('Switching to Wi-Fi', () => window.mobMirror.enableTcpip(t.serial))}>
                    <Wifi /> Switch to Wi-Fi (adb tcpip)
                  </DropdownMenuItem>
                )}
                {t.kind === 'wifi' && isIpSerial(t.serial) && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={() => void run('Disconnecting', () => window.mobMirror.disconnect(t.serial))}>
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
  )
}
