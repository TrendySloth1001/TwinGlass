import { Check, CircleHelp, Copy, Loader2, Play, QrCode, RefreshCw, Smartphone, Usb, Wifi } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { AdbStatusInfo, DeviceListInfo, TransportInfo } from '../../../preload/api'
import { AddDeviceDialog } from '@/components/add-device-dialog'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

interface ConnectPanelProps {
  list: DeviceListInfo | null
  error: string | null
  adb: AdbStatusInfo | null
  refresh: () => void
  connecting: boolean
  /** Hardware id of the phone mirrored last time (listed first). */
  lastDevice: string | null
  onMirror: (t: TransportInfo, deviceId: string) => void
}

const INSTALL = 'brew install android-platform-tools'

/** Pulsing dot: the app is watching for the phone by itself (no Refresh needed). */
function Waiting({ children }: { children: ReactNode }): ReactNode {
  return (
    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
      <span className="relative flex size-1.5">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand opacity-70" />
        <span className="relative inline-flex size-1.5 rounded-full bg-brand" />
      </span>
      {children}
    </div>
  )
}

function UsbHelp(): ReactNode {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="ghost" className="h-7 rounded-full text-xs text-muted-foreground">
          <CircleHelp /> Turn on USB debugging
        </Button>
      </PopoverTrigger>
      <PopoverContent side="bottom" className="w-72 text-xs">
        <ol className="flex list-decimal flex-col gap-1.5 pl-4 text-muted-foreground">
          <li>
            <b className="text-foreground">Settings → About phone</b>: tap <b className="text-foreground">Build number</b> 7 times.
          </li>
          <li>
            <b className="text-foreground">Developer options → USB debugging</b>: on.
          </li>
          <li>
            Plug the phone in and tap <b className="text-foreground">Allow</b> (tick “Always allow”).
          </li>
          <li>
            For Wi-Fi: <b className="text-foreground">Wireless debugging</b> on, then pair once (Android 11+).
          </li>
        </ol>
      </PopoverContent>
    </Popover>
  )
}

/**
 * The home screen with nothing mirrored: the familiar phone tile and title, plus what to do next.
 * Ready phones get a one-click Mirror button, phones waiting for "Allow" say so, and with no phone
 * there is help for USB and Wi-Fi. The device list is live, so this updates by itself.
 */
export function ConnectPanel(p: ConnectPanelProps): ReactNode {
  const [pairing, setPairing] = useState(false)
  const [copied, setCopied] = useState(false)
  const devices = [...(p.list?.devices ?? [])].sort((a, b) => Number(b.id === p.lastDevice) - Number(a.id === p.lastDevice))
  const pending = p.list?.other ?? []
  const adbMissing = p.adb !== null && !p.adb.adbPath
  const unauthorized = pending.some((t) => t.state === 'unauthorized')

  const title = adbMissing
    ? 'One-time setup'
    : devices.length
      ? 'Ready to mirror'
      : pending.length
        ? unauthorized
          ? 'Check your phone'
          : 'Phone not ready'
        : 'No device mirrored'
  const hint = adbMissing
    ? 'Mob Mirror needs Android’s adb tool. Install it in Terminal:'
    : devices.length
      ? 'Click and drag to touch, scroll to scroll, type to type.'
      : pending.length
        ? unauthorized
          ? 'Tap Allow on “Allow USB debugging?”. Tick “Always allow” to skip this next time.'
          : 'Unlock the phone, or unplug it and plug it back in.'
        : 'Plug in your phone with a USB cable, or pair it over Wi-Fi.'

  return (
    <div className="relative z-10 flex flex-col items-center gap-3 px-4 text-center text-muted-foreground">
      <div className="grid size-14 place-items-center rounded-2xl border border-border bg-background/60 backdrop-blur">
        {p.connecting ? <Loader2 className="size-7 animate-spin" /> : <Smartphone className="size-7" />}
      </div>
      <div className="text-base font-medium text-foreground">{title}</div>
      <div className="max-w-80 text-xs text-balance text-muted-foreground">{hint}</div>

      {adbMissing && (
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-1 rounded-full border border-border bg-background/60 py-0.5 pr-0.5 pl-3 font-mono text-[11px] text-foreground">
            {INSTALL}
            <Button
              size="icon-xs"
              variant="ghost"
              className="rounded-full"
              aria-label="Copy command"
              onClick={() =>
                void navigator.clipboard.writeText(INSTALL).then(() => {
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1500)
                })
              }
            >
              {copied ? <Check /> : <Copy />}
            </Button>
          </div>
          <Button size="sm" variant="ghost" className="h-7 rounded-full text-xs text-muted-foreground" onClick={p.refresh}>
            <RefreshCw /> Check again
          </Button>
        </div>
      )}

      {devices.length > 0 && (
        <div className="mt-1 flex flex-col items-center gap-2">
          {devices.slice(0, 4).map((d) => {
            const best = d.transports[0] // ranked by main: USB first
            if (!best) return null
            return (
              <Button
                key={d.id}
                size="sm"
                variant={d === devices[0] ? 'default' : 'secondary'}
                className="rounded-full pr-3.5"
                disabled={p.connecting}
                onClick={() => p.onMirror(best, d.id)}
              >
                <Play /> Mirror {d.model}
                <span className="flex items-center gap-1 opacity-60">
                  · {best.kind === 'usb' ? <Usb /> : <Wifi />}
                  {best.kind === 'usb' ? 'USB' : 'Wi-Fi'}
                </span>
              </Button>
            )
          })}
        </div>
      )}

      {pending.length > 0 && devices.length === 0 && <Waiting>Waiting for your phone…</Waiting>}

      {!adbMissing && devices.length === 0 && pending.length === 0 && (
        <>
          <div className="mt-1 flex flex-wrap items-center justify-center gap-1">
            <UsbHelp />
            <Button size="sm" variant="ghost" className="h-7 rounded-full text-xs text-muted-foreground" onClick={() => setPairing(true)}>
              <QrCode /> Pair over Wi-Fi
            </Button>
          </div>
          <Waiting>Looking for phones…</Waiting>
        </>
      )}

      {p.error && !adbMissing && <div className="max-w-72 text-[11px] text-destructive">{p.error}</div>}

      <AddDeviceDialog open={pairing} onOpenChange={setPairing} />
    </div>
  )
}
