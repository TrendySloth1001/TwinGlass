import {
  AppWindow,
  ArrowRight,
  BatteryCharging,
  BatteryFull,
  BatteryLow,
  BatteryMedium,
  Cable,
  Check,
  ClipboardList,
  Copy,
  Keyboard,
  Loader2,
  LockKeyhole,
  MousePointer2,
  Play,
  QrCode,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Smartphone,
  Terminal,
  Usb,
  Wifi,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import type { AdbStatusInfo, DeviceInfo, DeviceListInfo, TransportInfo } from '../../../preload/api'
import { AddDeviceDialog } from '@/components/add-device-dialog'
import { HomeIllustration } from '@/components/home-illustration'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

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
}

const INSTALL = 'brew install android-platform-tools'

/**
 * A widget inside the headline sentence: icon in an ink circle + a label, like an inline tag.
 * Clickable when it does something (the phone chip starts mirroring).
 */
function Chip({ icon, children, onClick, title }: { icon: ReactNode; children: ReactNode; onClick?: () => void; title?: string }): ReactNode {
  const Tag = onClick ? 'button' : 'span'
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      title={title}
      className={cn(
        'mx-1 inline-flex translate-y-[-0.12em] items-center gap-2 rounded-full border bg-card py-1 pr-3.5 pl-1 align-middle font-sans text-[0.42em] leading-none font-medium tracking-normal text-foreground shadow-sm',
        onClick && 'cursor-pointer transition-colors hover:bg-accent',
      )}
    >
      <span className="grid size-[1.75em] place-items-center rounded-full bg-foreground text-background [&_svg]:size-[0.95em]">{icon}</span>
      <span className="flex items-center gap-1.5 whitespace-nowrap">{children}</span>
    </Tag>
  )
}

function BatteryIcon({ level, charging }: { level: number; charging: boolean }): ReactNode {
  if (charging) return <BatteryCharging className="size-[1em] text-success" />
  if (level <= 20) return <BatteryLow className="size-[1em] text-destructive" />
  if (level <= 60) return <BatteryMedium className="size-[1em]" />
  return <BatteryFull className="size-[1em]" />
}

/** The phone as a live widget in the sentence: name and battery; click = mirror. */
function PhoneChip({ device, onMirror }: { device: DeviceInfo; onMirror: ConnectPanelProps['onMirror'] }): ReactNode {
  const best = device.transports[0]
  const [d, setD] = useState<Details>(null)
  useEffect(() => {
    if (!best) return
    let alive = true
    const load = (): void => void window.mobMirror.deviceDetails(best.serial).then((x) => alive && setD(x), () => {})
    load()
    const t = setInterval(load, 30_000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [best?.serial])
  if (!best) return null
  return (
    <Chip icon={<Smartphone />} onClick={() => onMirror(best, device.id)} title={`Mirror ${device.model}`}>
      {device.model}
      {d?.battery != null && (
        <span className="flex items-center gap-1 text-muted-foreground">
          · <BatteryIcon level={d.battery} charging={d.charging} />
          {d.battery}%
        </span>
      )}
    </Chip>
  )
}

/** Small text link under the actions ("Browse empty states →" style). */
function TextLink({ children, onClick }: { children: ReactNode; onClick: () => void }): ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      className="font-display group inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground [&_svg]:size-3.5"
    >
      {children}
      <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
    </button>
  )
}

/**
 * The home screen with nothing mirrored, written as one sentence with live widgets in it (your
 * phone, the mouse and keyboard, ⌘L) beside an illustration. Adapts to: phones ready, a phone
 * waiting for "Allow", no phone, adb missing. The device list is live, so it updates by itself.
 */
export function ConnectPanel(p: ConnectPanelProps): ReactNode {
  const [pairing, setPairing] = useState(false)
  const [copied, setCopied] = useState(false)
  const devices = [...(p.list?.devices ?? [])].sort((a, b) => Number(b.id === p.lastDevice) - Number(a.id === p.lastDevice))
  const pending = p.list?.other ?? []
  const adbMissing = p.adb !== null && !p.adb.adbPath
  const first = devices[0]
  const best = first?.transports[0]
  const usb = first?.transports.find((t) => t.kind === 'usb')
  const hasWifi = !!first?.transports.some((t) => t.kind === 'wifi')

  let eyebrow: string
  let sentence: ReactNode
  if (adbMissing) {
    eyebrow = 'One-time setup'
    sentence = (
      <>
        First, add Android’s <Chip icon={<Terminal />}>adb</Chip> tool to this Mac with one command.
      </>
    )
  } else if (first) {
    eyebrow = 'Mirror'
    sentence = (
      <>
        Mirror your{' '}
        {devices.map((d, i) => (
          <span key={d.id}>
            {i > 0 && (i === devices.length - 1 ? ' or ' : ', ')}
            <PhoneChip device={d} onMirror={p.onMirror} />
          </span>
        ))}{' '}
        right here, then tap, scroll and type with your <Chip icon={<MousePointer2 />}>mouse</Chip> and{' '}
        <Chip icon={<Keyboard />}>keyboard</Chip>. Locked? <Chip icon={<LockKeyhole />}>⌘L</Chip> types your PIN for you.
      </>
    )
  } else if (pending.length) {
    eyebrow = 'Almost there'
    sentence = (
      <>
        Almost there. Tap <Chip icon={<ShieldCheck />}>Allow</Chip> on your phone when it asks about USB debugging, and tick
        “Always allow”.
      </>
    )
  } else {
    eyebrow = 'Connect'
    sentence = (
      <>
        Plug your phone into this Mac with a <Chip icon={<Cable />}>USB cable</Chip>, or pair it over{' '}
        <Chip icon={<Wifi />} onClick={() => setPairing(true)} title="Pair over Wi-Fi">
          Wi-Fi
        </Chip>
        , and it shows up right here.
      </>
    )
  }

  return (
    <div className="@container relative z-10 w-full max-w-[1100px] px-10">
      <div className="grid items-center gap-10 @3xl:grid-cols-[1.25fr_1fr]">
        <div className="flex flex-col items-start gap-5">
          {/* accent icon + eyebrow tag, like the reference */}
          <Smartphone className="size-9 text-[#F2557A]" strokeWidth={1.6} />
          <span className="inline-flex items-center gap-2 rounded-full border bg-card py-1 pr-3 pl-1 text-xs font-medium shadow-sm">
            <span className="grid size-5 place-items-center rounded-full bg-foreground text-background">
              {first ? <Play className="size-2.5" /> : <Cable className="size-2.5" />}
            </span>
            {eyebrow}
          </span>

          <h1 className="font-display text-[clamp(28px,3.4vw,46px)] leading-[1.45] font-normal tracking-[-0.01em] text-foreground">{sentence}</h1>

          {/* What to do next */}
          {adbMissing && (
            <div className="flex w-full max-w-md items-center gap-2 rounded-lg border bg-card px-3 py-2 font-mono text-sm shadow-sm">
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
          )}
          {first && best && (
            <div className="flex flex-wrap items-center gap-2">
              <Button size="lg" disabled={p.connecting} onClick={() => p.onMirror(best, first.id)} className="rounded-full pr-5">
                {p.connecting ? <Loader2 className="animate-spin" /> : <Play />}
                Mirror {first.model}
                <span className="ml-1 text-xs opacity-60">{best.kind === 'usb' ? 'USB' : 'Wi-Fi'}</span>
              </Button>
              {first.transports
                .filter((t) => t !== best)
                .map((t) => (
                  <Button key={t.serial} size="lg" variant="outline" className="rounded-full" disabled={p.connecting} onClick={() => p.onMirror(t, first.id)}>
                    {t.kind === 'usb' ? <Usb /> : <Wifi />} Over {t.kind === 'usb' ? 'USB' : 'Wi-Fi'}
                  </Button>
                ))}
              <Button size="lg" variant="outline" className="rounded-full" onClick={() => void window.mobMirror.openDeviceWindow(best.serial, best.kind)}>
                <AppWindow /> New window
              </Button>
              {usb && !hasWifi && (
                <Button
                  size="lg"
                  variant="outline"
                  className="rounded-full"
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
          )}
          {!first && !adbMissing && !pending.length && (
            <ol className="flex max-w-lg flex-col gap-1.5 text-sm text-muted-foreground">
              <li>
                1. On the phone: <b className="font-medium text-foreground">Settings → About phone</b>, tap <b className="font-medium text-foreground">Build number</b> 7 times.
              </li>
              <li>
                2. <b className="font-medium text-foreground">Developer options → USB debugging</b>: on.
              </li>
              <li>3. Plug it in. Mob Mirror is already watching for it.</li>
            </ol>
          )}
          {p.error && !adbMissing && <p className="text-xs text-destructive">{p.error}</p>}

          {/* Secondary paths, as quiet text links */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-1">
            {adbMissing && (
              <TextLink onClick={p.refresh}>
                <RefreshCw /> I’ve installed it
              </TextLink>
            )}
            {first && (
              <TextLink onClick={p.onOpenPalette}>
                <Search /> Open an app (⌘K)
              </TextLink>
            )}
            <TextLink onClick={p.onOpenClipboard}>
              <ClipboardList /> Clipboard history
            </TextLink>
            {!adbMissing && (
              <TextLink onClick={() => setPairing(true)}>
                <QrCode /> Pair a phone over Wi-Fi
              </TextLink>
            )}
            <TextLink onClick={p.onOpenSettings}>
              <Settings /> Settings
            </TextLink>
          </div>
        </div>

        <HomeIllustration className="mx-auto hidden w-full max-w-[460px] text-foreground @3xl:block" />
      </div>

      <AddDeviceDialog open={pairing} onOpenChange={setPairing} />
    </div>
  )
}
