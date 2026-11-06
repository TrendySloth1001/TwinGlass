import {
  AppWindow,
  BatteryCharging,
  BatteryFull,
  BatteryLow,
  BatteryMedium,
  Cable,
  Check,
  ClipboardList,
  Copy,
  Loader2,
  Play,
  QrCode,
  RefreshCw,
  Search,
  Settings,
  ShieldQuestion,
  Usb,
  Wifi,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import type { AdbStatusInfo, DeviceInfo, DeviceListInfo, TransportInfo } from '../../../preload/api'
import { AddDeviceDialog } from '@/components/add-device-dialog'
import { MiniPhone } from '@/components/mini-phone'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Kbd } from '@/components/ui/kbd'
import type { FrameColor, FrameStyle } from '@/lib/phone-frames'

type Details = Awaited<ReturnType<typeof window.mobMirror.deviceDetails>>

interface ConnectPanelProps {
  list: DeviceListInfo | null
  error: string | null
  adb: AdbStatusInfo | null
  refresh: () => void
  connecting: boolean
  /** Hardware id of the phone mirrored last time (listed first). */
  lastDevice: string | null
  onMirror: (t: TransportInfo, deviceId: string) => void
  onOpenPalette: () => void
  onOpenClipboard: () => void
  onOpenSettings: () => void
  frame: FrameStyle
  frameColor: FrameColor
}

const INSTALL = 'brew install android-platform-tools'

function BatteryIcon({ level, charging }: { level: number; charging: boolean }): ReactNode {
  if (charging) return <BatteryCharging className="size-3.5 text-success" />
  if (level <= 20) return <BatteryLow className="size-3.5 text-destructive" />
  if (level <= 60) return <BatteryMedium className="size-3.5" />
  return <BatteryFull className="size-3.5" />
}

/** One phone: picture, details, and everything you can do with it. */
function PhoneCard({
  device,
  last,
  connecting,
  onMirror,
  frame,
  frameColor,
}: {
  device: DeviceInfo
  last: boolean
  connecting: boolean
  onMirror: ConnectPanelProps['onMirror']
  frame: FrameStyle
  frameColor: FrameColor
}): ReactNode {
  const best = device.transports[0] // ranked by main: USB first
  const [d, setD] = useState<Details>(null)
  useEffect(() => {
    if (!best) return
    let alive = true
    const load = (): void => void window.mobMirror.deviceDetails(best.serial).then((x) => alive && setD(x), () => {})
    load()
    const t = setInterval(load, 30_000) // battery stays current while the card is shown
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [best?.serial])
  if (!best) return null
  const usb = device.transports.find((t) => t.kind === 'usb')
  const hasWifi = device.transports.some((t) => t.kind === 'wifi')
  const sub = [d?.manufacturer, d?.android && `Android ${d.android}`].filter(Boolean).join(' · ')

  return (
    <Card className="flex-row items-center gap-5 p-5 shadow-sm">
      <div className="shrink-0 [--mp-h:112px] [--mp-w:54px]">
        <MiniPhone style={frame === 'none' ? 'modern' : frame} color={frameColor} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-lg font-semibold">{device.model}</span>
            {last && (
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                Last used
              </Badge>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {sub && <span>{sub}</span>}
            {d?.battery !== null && d?.battery !== undefined && (
              <span className="flex items-center gap-1">
                <BatteryIcon level={d.battery} charging={d.charging} />
                {d.battery}%{d.charging ? ' · charging' : ''}
              </span>
            )}
            {device.transports.map((t) => (
              <span key={t.serial} className="flex items-center gap-1">
                {t.kind === 'usb' ? <Usb className="size-3.5" /> : <Wifi className="size-3.5" />}
                {t.kind === 'usb' ? 'USB' : 'Wi-Fi'}
              </span>
            ))}
          </div>
        </div>
        {/* Every option as a button (no hidden menu). The best link (USB first) is the main one. */}
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={connecting} onClick={() => onMirror(best, device.id)} className="pr-4">
            {connecting ? <Loader2 className="animate-spin" /> : <Play />}
            Mirror
            <span className="ml-1 text-xs opacity-60">{best.kind === 'usb' ? 'USB' : 'Wi-Fi'}</span>
          </Button>
          {device.transports
            .filter((t) => t !== best)
            .map((t) => (
              <Button key={t.serial} variant="outline" disabled={connecting} onClick={() => onMirror(t, device.id)}>
                {t.kind === 'usb' ? <Usb /> : <Wifi />} Mirror over {t.kind === 'usb' ? 'USB' : 'Wi-Fi'}
              </Button>
            ))}
          <Button variant="outline" onClick={() => void window.mobMirror.openDeviceWindow(best.serial, best.kind)}>
            <AppWindow /> New window
          </Button>
          {usb && !hasWifi && (
            <Button
              variant="outline"
              onClick={() =>
                void window.mobMirror.enableTcpip(usb.serial).then(
                  (r) => (r.ok ? toast.success('Connected over Wi-Fi too', { description: r.message }) : toast.error(r.message)),
                  (e: unknown) => toast.error(String(e)),
                )
              }
            >
              <Wifi /> Connect over Wi-Fi
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
}

function Step({ n, children }: { n: number; children: ReactNode }): ReactNode {
  return (
    <li className="flex gap-2.5">
      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">{n}</span>
      <span className="pt-0.5">{children}</span>
    </li>
  )
}

/** A pulsing dot: the app is watching for phones by itself (no Refresh needed). */
function Waiting({ children }: { children: ReactNode }): ReactNode {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand opacity-60" />
        <span className="relative inline-flex size-2 rounded-full bg-brand" />
      </span>
      {children}
    </div>
  )
}

function Shortcut({ icon, label, keys, onClick }: { icon: ReactNode; label: string; keys: string; onClick: () => void }): ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground [&_svg]:size-3.5"
    >
      {icon}
      {label}
      <Kbd>{keys}</Kbd>
    </button>
  )
}

/**
 * The home screen with nothing mirrored: your phones with what you can do with each, or how to
 * connect one. The device list is live (adb track-devices), so it updates by itself.
 */
export function ConnectPanel(p: ConnectPanelProps): ReactNode {
  const [pairing, setPairing] = useState(false)
  const [copied, setCopied] = useState(false)
  const devices = [...(p.list?.devices ?? [])].sort((a, b) => Number(b.id === p.lastDevice) - Number(a.id === p.lastDevice))
  const pending = p.list?.other ?? []
  const adbMissing = p.adb !== null && !p.adb.adbPath
  const nothing = devices.length === 0 && pending.length === 0

  return (
    <div className="relative z-10 flex w-full max-w-[720px] flex-col gap-5 px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {adbMissing ? 'One-time setup' : devices.length ? (devices.length > 1 ? 'Your phones' : 'Your phone') : 'Connect a phone'}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {adbMissing
            ? 'Mob Mirror talks to Android phones through adb. Install it once:'
            : devices.length
              ? 'Mirror it on your Mac and control it with the mouse and keyboard.'
              : 'Use a USB cable for the lowest latency, or Wi-Fi to go wireless.'}
        </p>
      </div>

      {adbMissing && (
        <Card className="gap-3 p-5 shadow-sm">
          <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 font-mono text-sm">
            <span className="flex-1 truncate">{INSTALL}</span>
            <Button
              size="icon-xs"
              variant="ghost"
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
          <Button size="sm" variant="outline" className="self-start" onClick={p.refresh}>
            <RefreshCw /> I’ve installed it
          </Button>
        </Card>
      )}

      {devices.map((d) => (
        <PhoneCard
          key={d.id}
          device={d}
          last={d.id === p.lastDevice}
          connecting={p.connecting}
          onMirror={p.onMirror}
          frame={p.frame}
          frameColor={p.frameColor}
        />
      ))}

      {pending.map((t) => (
        <Card key={t.serial} className="flex-row items-center gap-4 border-dashed p-5 shadow-none">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-muted">
            <ShieldQuestion className="size-5 text-warning" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-medium">{t.state === 'unauthorized' ? 'Check your phone' : 'Phone not ready'}</div>
            <div className="text-xs text-muted-foreground">
              {t.state === 'unauthorized'
                ? 'Tap Allow on “Allow USB debugging?”. Tick “Always allow” to skip this next time.'
                : t.state === 'offline'
                  ? 'Unlock the phone, or unplug it and plug it back in.'
                  : `adb reports “${t.state}”.`}
            </div>
          </div>
          <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
        </Card>
      ))}

      {nothing && !adbMissing && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Card className="gap-3 p-5 shadow-sm">
            <div className="flex items-center gap-2 font-medium">
              <Cable className="size-4" /> USB cable
              <Badge variant="secondary" className="ml-auto h-5 px-1.5 text-[10px]">
                Recommended
              </Badge>
            </div>
            <ol className="flex flex-col gap-2 text-xs text-muted-foreground">
              <Step n={1}>
                On the phone: <b className="text-foreground">Settings → About phone</b>, tap <b className="text-foreground">Build number</b> 7 times.
              </Step>
              <Step n={2}>
                <b className="text-foreground">Developer options → USB debugging</b>: on.
              </Step>
              <Step n={3}>
                Plug it in and tap <b className="text-foreground">Allow</b>.
              </Step>
            </ol>
            <Waiting>Looking for phones…</Waiting>
          </Card>
          <Card className="gap-3 p-5 shadow-sm">
            <div className="flex items-center gap-2 font-medium">
              <Wifi className="size-4" /> Wi-Fi
            </div>
            <ol className="flex flex-col gap-2 text-xs text-muted-foreground">
              <Step n={1}>Phone and Mac on the same Wi-Fi.</Step>
              <Step n={2}>
                <b className="text-foreground">Developer options → Wireless debugging</b>: on (Android 11+).
              </Step>
              <Step n={3}>Pair once with a QR code.</Step>
            </ol>
            <Button size="sm" variant="outline" className="mt-auto self-start" onClick={() => setPairing(true)}>
              <QrCode /> Pair over Wi-Fi
            </Button>
          </Card>
        </div>
      )}

      {p.error && !adbMissing && <p className="text-xs text-destructive">{p.error}</p>}

      {/* Everything else you can do, discoverable without reading docs. */}
      <div className="flex flex-wrap items-center gap-1 border-t pt-3">
        {devices.length > 0 && <Shortcut icon={<Search />} label="Open an app" keys="⌘K" onClick={p.onOpenPalette} />}
        <Shortcut icon={<ClipboardList />} label="Clipboard" keys="⇧⌘V" onClick={p.onOpenClipboard} />
        <Shortcut icon={<Settings />} label="Settings" keys="⌘," onClick={p.onOpenSettings} />
        {!nothing && (
          <button
            type="button"
            onClick={() => setPairing(true)}
            className="ml-auto flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground [&_svg]:size-3.5"
          >
            <QrCode /> Add a phone over Wi-Fi
          </button>
        )}
      </div>

      <AddDeviceDialog open={pairing} onOpenChange={setPairing} />
    </div>
  )
}
