import { AppWindow, Cable, Check, ChevronDown, ClipboardList, Copy, Film, Image as ImageIcon, Info, Keyboard, Layers, Loader2, LockKeyhole, Play, Plus, QrCode, RefreshCw, Search, ShieldAlert, Usb, Wifi } from 'lucide-react'
import { showPhoneDetails } from '@/lib/phone-details'
import { useRef, useEffect, useState, type ReactNode } from 'react'
import { useVisibleInterval } from '@/hooks/use-visible-interval'
import { toast } from 'sonner'
import type { AdbStatusInfo, DeviceInfo, DeviceListInfo, TransportInfo } from '../../../preload/api'
import { AddDeviceDialog } from '@/components/add-device-dialog'
import { MiniPhone } from '@/components/mini-phone'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { FrameColor, FrameStyle } from '@/lib/phone-frames'
import { cn } from '@/lib/utils'
import { LogoMark } from '@/components/logo-mark'
import { SectionHeader } from '@/components/section-header'
import { AddPhoneSheet } from '@/components/add-phone-sheet'
import { DirectPhones, useDirectPhones } from '@/components/direct-phones'

type Details = Awaited<ReturnType<typeof window.mobMirror.deviceDetails>>

interface ConnectPanelProps {
  list: DeviceListInfo | null
  error: string | null
  adb: AdbStatusInfo | null
  refresh: () => void
  connecting: boolean
  /** Hardware id of the phone mirrored last time (listed first). */
  lastDevice: string | null
  recentDevices: { id: string; model: string; at: number }[]
  onMirror: (t: TransportInfo, deviceId: string) => void
  onOpenPalette: () => void
  onOpenClipboard: () => void
  onOpenSettings: () => void
  onShowHelp: () => void
  /** Pick an app to open on a second screen (a new virtual display) in its own window. */
  onSecondScreen: () => void
  autoConnect: boolean
  onAutoConnectChange: (on: boolean) => void
  frame: FrameStyle
  frameColor: FrameColor
}

const INSTALL = 'brew install android-platform-tools'
const linkName = (t: TransportInfo): string => (t.kind === 'usb' ? 'USB' : 'Wi-Fi')

function useDetails(serial: string | undefined): Details {
  const [d, setD] = useState<Details>(null)
  const alive = useRef(serial)
  alive.current = serial
  const load = (): void => {
    if (!serial) return
    void window.mobMirror.deviceDetails(serial).then((x) => alive.current === serial && setD(x), () => {})
  }
  useEffect(load, [serial])
  useVisibleInterval(load, 30_000, !!serial) // battery stays current while the page is seen
  return d
}



function SectionTitle({ children }: { children: ReactNode }): ReactNode {
  return <SectionHeader>{children}</SectionHeader>
}

/** The phone, big: picture, facts, and the ways to mirror it. */
function PhoneHero(props: {
  onSecondScreen: () => void
  device: DeviceInfo
  connecting: boolean
  onMirror: ConnectPanelProps['onMirror']
  frame: FrameStyle
  frameColor: FrameColor
}): ReactNode {
  const { device, connecting, onMirror } = props
  const best = device.transports[0] // ranked by main: USB first
  const d = useDetails(best?.serial)
  if (!best) return null
  const usb = device.transports.find((t) => t.kind === 'usb')
  const hasWifi = device.transports.some((t) => t.kind === 'wifi')
  return (
    <div className="flex items-center gap-6 py-2">
      <div className="shrink-0 [--mp-h:96px] [--mp-w:46px]">
        <MiniPhone style={props.frame === 'none' ? 'modern' : props.frame} color={props.frameColor} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div>
          <div className="text-lg font-semibold">{device.model}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[13px] text-muted-foreground">
            {[d?.manufacturer, d?.android && `Android ${d.android}`, d?.battery != null && `${d.battery}%${d.charging ? ' charging' : ''}`, device.transports.map(linkName).join(' + ')]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="lg" disabled={connecting} onClick={() => onMirror(best, device.id)}>
            {connecting ? <Loader2 className="animate-spin" /> : <Play />}
            Mirror
            <span className="text-xs opacity-60">{linkName(best)}</span>
          </Button>
          {device.transports
            .filter((t) => t !== best)
            .map((t) => (
              <Button key={t.serial} variant="ghost" disabled={connecting} onClick={() => onMirror(t, device.id)}>
                {t.kind === 'usb' ? <Usb /> : <Wifi />} {linkName(t)}
              </Button>
            ))}
          <Button variant="ghost" onClick={() => void window.mobMirror.openDeviceWindow(best.serial, best.kind)}>
            <AppWindow /> New window
          </Button>
          <Button variant="ghost" onClick={() => showPhoneDetails(best.serial, device.model)}>
            <Info /> Details
          </Button>
          <Button variant="ghost" onClick={props.onSecondScreen} title="A second, independent screen of this phone with all its apps, while you keep using the phone">
            <Layers /> Second screen
          </Button>
          {usb && !hasWifi && (
            <Button
              variant="ghost"
              onClick={() =>
                void window.mobMirror.enableTcpip(usb.serial).then(
                  (r) => (r.ok ? toast.success('Connected over Wi-Fi too', { description: r.message }) : toast.error(r.message)),
                  (e: unknown) => toast.error(String(e)),
                )
              }
            >
              <Wifi /> Add Wi-Fi
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

/** Newest screenshots and recordings (both capture folders), with Quick Look thumbnails. */
function RecentCaptures(): ReactNode {
  const [items, setItems] = useState<Awaited<ReturnType<typeof window.mobMirror.recentCaptures>> | null>(null)
  const load = (): void => void window.mobMirror.recentCaptures(6).then(setItems, () => setItems([]))
  useEffect(load, [])
  useVisibleInterval(load, 15_000) // picks up new screenshots while the page is seen
  if (items === null) return null
  if (!items.length) return <p className="text-[13px] text-muted-foreground">Screenshots and recordings you take show up here.</p>
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
      {items.map((it) => (
        <button
          key={it.path}
          type="button"
          title={it.name}
          onClick={() => void window.mobMirror.openCapture(it.path)}
          onContextMenu={(e) => {
            e.preventDefault()
            void window.mobMirror.reveal(it.path)
          }}
          className="group relative aspect-[3/4] overflow-hidden rounded-[3px] border bg-muted"
        >
          {it.thumb ? (
            <img src={it.thumb} alt="" className="size-full object-cover transition-transform group-hover:scale-105" draggable={false} />
          ) : (
            <span className="grid size-full place-items-center text-muted-foreground">{it.kind === 'video' ? <Film className="size-5" /> : <ImageIcon className="size-5" />}</span>
          )}
          {it.kind === 'video' && (
            <span className="absolute right-1.5 bottom-1.5 grid size-5 place-items-center rounded-full bg-black/60 text-white">
              <Play className="size-2.5 fill-current" />
            </span>
          )}
          <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-1.5 pt-4 pb-1 text-left text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
            {ago(it.at)}
          </span>
        </button>
      ))}
    </div>
  )
}


/** A quick action: icon, label, shortcut. Plain row, highlighted on hover. */
function Tile({ icon, title, keys, onClick, disabled }: { icon: ReactNode; title: string; keys?: string; onClick: () => void; disabled?: boolean }): ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-3 rounded-[3px] px-3 py-2.5 text-left transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50 [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-muted-foreground"
    >
      {icon}
      <span className="min-w-0 flex-1 truncate text-[13px]">{title}</span>
      {keys && <Kbd>{keys}</Kbd>}
    </button>
  )
}

type GuideId = 'start' | 'wireless' | 'unlock' | 'controls'
const b = (t: string): ReactNode => <b className="font-medium text-foreground">{t}</b>

const GUIDES: { id: GuideId; title: string; icon: ReactNode; steps: ReactNode[] }[] = [
  {
    id: 'start',
    title: 'Connect with USB',
    icon: <Cable />,
    steps: [
      <>On the phone: {b('Settings → About phone')}, tap {b('Build number')} 7 times.</>,
      <>{b('Developer options → USB debugging')}: on.</>,
      <>Plug it in and tap {b('Allow')} (tick “Always allow”). It shows up here.</>,
    ],
  },
  {
    id: 'wireless',
    title: 'Go wireless',
    icon: <Wifi />,
    steps: [
      <>Phone and Mac on the same Wi-Fi.</>,
      <>{b('Developer options → Wireless debugging')}: on (Android 11+).</>,
      <>{b('Pair with QR code')} on the phone, then scan Twinglass’s code.</>,
    ],
  },
  {
    id: 'unlock',
    title: 'Unlock with your PIN',
    icon: <LockKeyhole />,
    steps: [
      <>PIN screens are hidden from capture, so they look black. That’s normal.</>,
      <>{b('⌘L')} types your saved PIN; {b('⌥⌘L')} lets you type one yourself.</>,
      <>Works for app locks too (WhatsApp, banking). Wrong PINs are never retried.</>,
    ],
  },
  {
    id: 'controls',
    title: 'Mouse & keyboard',
    icon: <Keyboard />,
    steps: [
      <>{b('Click')} taps, {b('drag')} swipes, {b('scroll')} scrolls. Right-click = Back.</>,
      <>Just {b('type')}. ⌘V pastes the Mac clipboard on the phone.</>,
      <>{b('⌥ + drag')} pinches and rotates. {b('⌘K')} opens any app.</>,
    ],
  },
]

function ago(at: number): string {
  const s = (Date.now() - at) / 1000
  if (s < 3600) return 'just now'
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return `${Math.floor(s / 86400)} d ago`
}

/**
 * Home screen with nothing mirrored: the phone front and centre with its actions, quick-action
 * tiles, recent phones, and short guides that expand in place. Updates live with the device list.
 */
export function ConnectPanel(p: ConnectPanelProps): ReactNode {
  const [pairing, setPairing] = useState(false)
  const [adding, setAdding] = useState(false)
  const directPhones = useDirectPhones()
  const [copied, setCopied] = useState(false)
  const [open, setOpen] = useState<GuideId | null>(null)
  const devices = [...(p.list?.devices ?? [])].sort((a, z) => Number(z.id === p.lastDevice) - Number(a.id === p.lastDevice))
  const pending = p.list?.other ?? []
  const adbMissing = p.adb !== null && !p.adb.adbPath
  const live = new Map(devices.map((d) => [d.id, d]))
  const first = devices[0]

  const status = adbMissing
    ? { dot: 'bg-warning', text: 'Setup needed' }
    : first
      ? { dot: 'bg-success', text: `${first.model} connected · ${first.transports[0] ? linkName(first.transports[0]) : ''}` }
      : pending.length
        ? { dot: 'bg-warning', text: 'Waiting for “Allow” on the phone' }
        : { dot: 'bg-muted-foreground animate-pulse', text: 'Looking for phones…' }

  return (
    <div className="relative z-10 w-full max-w-[1040px] px-10 py-4">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <LogoMark className="size-11 shrink-0 text-foreground" />
          <div>
            <div className="text-[28px] leading-tight font-light tracking-tight">Twinglass</div>
            <div className="text-[17px] font-light text-muted-foreground">Your Android phone, right on your Mac.</div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <span className={cn('size-2 rounded-full', status.dot)} />
            {status.text}
          </span>
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus /> Add phone
          </Button>
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[1.5fr_1fr]">
        {/* ---- main column ---- */}
        <div className="flex min-w-0 flex-col gap-8">
          <section>
            <SectionTitle>{devices.length + directPhones.length > 1 ? 'Your phones' : 'Your phone'}</SectionTitle>
            <div className="flex flex-col gap-3">
              <DirectPhones phones={directPhones} onMirror={p.onMirror} connecting={p.connecting} />
              {devices.map((d) => (
                <PhoneHero key={d.id} onSecondScreen={p.onSecondScreen} device={d} connecting={p.connecting} onMirror={p.onMirror} frame={p.frame} frameColor={p.frameColor} />
              ))}
              {pending.map((t) => (
                <div key={t.serial} className="flex items-center gap-3 rounded-[4px] border border-dashed bg-card p-5 text-sm">
                  <ShieldAlert className="size-5 shrink-0 text-warning" />
                  <div className="flex-1">
                    <div className="font-medium">{t.state === 'unauthorized' ? 'Check your phone' : 'Phone not ready'}</div>
                    <div className="text-xs text-muted-foreground">
                      {t.state === 'unauthorized' ? 'Tap Allow on “Allow USB debugging?” and tick “Always allow”.' : 'Unlock it, or unplug and plug it back in.'}
                    </div>
                  </div>
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                </div>
              ))}
              {adbMissing && (
                <div className="rounded-[4px] border bg-card p-5">
                  <div className="mb-1 font-medium">Install Android’s adb tool once</div>
                  <div className="mb-3 text-xs text-muted-foreground">Twinglass talks to your phone through it. Run this in Terminal:</div>
                  <div className="flex items-center gap-2 rounded-[3px] bg-muted px-3 py-2 font-mono text-sm">
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
                  <Button size="sm" variant="outline" className="mt-3" onClick={p.refresh}>
                    <RefreshCw /> I’ve installed it
                  </Button>
                </div>
              )}
              {!devices.length && !pending.length && !directPhones.length && (
                <div className="flex items-center gap-5 rounded-[4px] border border-dashed p-5">
                  <div className="shrink-0 opacity-60 [--mp-h:96px] [--mp-w:46px]">
                    <MiniPhone style={p.frame === 'none' ? 'modern' : p.frame} color={p.frameColor} />
                  </div>
                  <div className="flex-1">
                    <div className="text-lg font-semibold">Add your phone</div>
                    <div className="mt-1 text-[13px] text-muted-foreground">
                      Over Wi-Fi with the Twinglass app: no cable, no developer options. Or use Developer mode for second screens, agents and the lowest latency.
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button onClick={() => setAdding(true)}>
                        <Wifi /> Add phone
                      </Button>
                      <Button variant="ghost" onClick={() => setOpen('start')}>
                        <Cable /> USB / Developer mode
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section>
            <SectionTitle>Quick actions</SectionTitle>
            <div className="grid gap-x-2 sm:grid-cols-2">
              <Tile icon={<Search />} title="Open an app on the phone" keys="⌘K" onClick={p.onOpenPalette} disabled={!devices.length} />
              <Tile icon={<ClipboardList />} title="Clipboard history" keys="⇧⌘V" onClick={p.onOpenClipboard} />
              <Tile icon={<QrCode />} title="Pair a phone over Wi-Fi" onClick={() => setPairing(true)} />
              <Tile icon={<Keyboard />} title="Shortcuts & gestures" onClick={p.onShowHelp} />
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <SectionTitle>Recent captures</SectionTitle>
              <button type="button" onClick={() => void window.mobMirror.openMediaFolder('pictures')} className="-mt-3 text-[11px] text-muted-foreground hover:text-foreground">
                Open folder
              </button>
            </div>
            <RecentCaptures />
          </section>
        </div>

        {/* ---- side column ---- */}
        <div className="flex min-w-0 flex-col gap-8">
          <section>
            <SectionTitle>Recent phones</SectionTitle>
            {p.recentDevices.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">Phones you mirror appear here for one-click reconnects.</p>
            ) : (
              <ul className="divide-y overflow-hidden rounded-[4px] border">
                {p.recentDevices.slice(0, 5).map((r) => {
                  const dev = live.get(r.id)
                  const t = dev?.transports[0]
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        disabled={!t || p.connecting}
                        onClick={() => t && dev && p.onMirror(t, dev.id)}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-accent disabled:cursor-default disabled:hover:bg-transparent"
                      >
                        <span className={cn('size-2 shrink-0 rounded-full', t ? 'bg-success' : 'bg-muted-foreground/40')} />
                        <span className="flex-1 truncate text-[13px] font-medium">{r.model}</span>
                        <span className="text-[11px] text-muted-foreground">{t ? linkName(t) : 'offline'} · {ago(r.at)}</span>
                        {t && <Play className="size-3.5 text-muted-foreground" />}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section>
            <SectionTitle>Guides</SectionTitle>
            <ul className="overflow-hidden rounded-[4px] border">
              {GUIDES.map((g) => {
                const isOpen = open === g.id
                return (
                  <li key={g.id} className="border-b last:border-b-0">
                    <button
                      type="button"
                      onClick={() => setOpen(isOpen ? null : g.id)}
                      aria-expanded={isOpen}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent [&>svg:first-child]:size-4 [&>svg:first-child]:text-muted-foreground"
                    >
                      {g.icon}
                      <span className="flex-1 text-[13px] font-medium">{g.title}</span>
                      <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', isOpen && 'rotate-180')} />
                    </button>
                    {/* grid-rows 0fr -> 1fr: smooth height without measuring */}
                    <div className={cn('grid transition-[grid-template-rows] duration-200', isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
                      <ol className="flex flex-col gap-2 overflow-hidden px-4 text-[12.5px] leading-relaxed text-muted-foreground">
                        {g.steps.map((s, i) => (
                          <li key={i} className={cn('flex gap-2.5', i === g.steps.length - 1 && 'pb-4')}>
                            <span className="w-3 shrink-0 text-right text-[11px] font-medium text-foreground">{i + 1}.</span>
                            <span>{s}</span>
                          </li>
                        ))}
                        {g.id === 'wireless' && (
                          <li className="pb-4">
                            <Button size="sm" variant="outline" onClick={() => setPairing(true)}>
                              <QrCode /> Pair over Wi-Fi
                            </Button>
                          </li>
                        )}
                      </ol>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>

          <div className="flex items-center justify-between gap-3 px-1">
            <Label htmlFor="home-autoconnect" className="text-[13px] font-normal">
              Mirror automatically when a phone connects
            </Label>
            <Switch id="home-autoconnect" checked={p.autoConnect} onCheckedChange={p.onAutoConnectChange} />
          </div>
        </div>
      </div>

      {p.error && !adbMissing && <p className="mt-6 text-xs text-destructive">{p.error}</p>}
      <AddDeviceDialog open={pairing} onOpenChange={setPairing} />
      <AddPhoneSheet
        open={adding}
        onOpenChange={setAdding}
        onDeveloper={() => {
          setAdding(false)
          setPairing(true)
        }}
      />
    </div>
  )
}
