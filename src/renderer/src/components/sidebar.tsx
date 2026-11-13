import {
  AlertTriangle,
  Bot,
  ChevronRight,
  MonitorSmartphone,
  PanelLeftClose,
  Pin,
  PinOff,
  Plus,
  RefreshCw,
  Smartphone,
  Volume2,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { AudioMode } from '@shared/ipc'
import { QUALITY_LABELS, QUALITY_SHORT, type CodecPreference, type Quality } from '@shared/quality'

const CODEC_SHORT: Record<CodecPreference, string> = { auto: 'Auto (H.265 if supported)', h265: 'H.265', h264: 'H.264' }
const AUDIO_SHORT: Record<AudioMode, string> = { off: 'Off', mac: 'On this Mac', both: 'Mac + phone' }
import type { AdbStatusInfo, DeviceListInfo, TransportInfo } from '../../../preload/api'
import { AddDeviceDialog } from '@/components/add-device-dialog'
import { AddPhoneSheet } from '@/components/add-phone-sheet'
import { AgentAccess } from '@/components/agent-access'
import { DesignView } from '@/components/design-view'
import { TestsView } from '@/components/tests-view'
import { DeviceCard } from '@/components/device-card'
import { IconButton } from '@/components/icon-button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import type { Settings } from '@/hooks/use-settings'
import { cn } from '@/lib/utils'

interface SidebarProps {
  /** Which view the activity bar picked. */
  view: 'phones' | 'tests' | 'design' | 'agents'
  /** The phone tests run on and designs are checked against (the one in front). */
  target: { serial: string; name: string } | null
  /** Start recording a test on the phone in front. */
  onRecord: () => void
  list: DeviceListInfo | null
  error: string | null
  adb: AdbStatusInfo | null
  refresh: () => void
  activeSerial: string | null
  connecting: boolean
  onMirror: (t: TransportInfo, deviceId: string) => void
  settings: Settings
  onSettingsChange: (patch: Partial<Settings>) => void
  /** Effective layout (narrow windows force floating). */
  layout: Settings['sidebarLayout']
  /** Window too narrow to dock. */
  layoutLocked: boolean
}

function stateHint(state: string): string {
  if (state === 'unauthorized') return 'Accept "Allow USB debugging?" on the phone.'
  if (state === 'offline') return 'Unlock the phone, or replug / re-enable wireless debugging.'
  return ''
}

/** Collapsible section with an animated body (CSS grid rows 0fr <-> 1fr, no JS measuring). */
function Section({
  title,
  icon,
  badge,
  action,
  closed,
  onToggle,
  children,
}: {
  title: string
  icon: ReactNode
  badge?: ReactNode
  action?: ReactNode
  closed: boolean
  onToggle: () => void
  children: ReactNode
}): ReactNode {
  return (
    // A VS Code view pane: 22 px bold caps header with a chevron, a hairline above each pane but the first.
    <section className="group/pane border-t border-sidebar-border first:border-t-0">
      <div className="flex h-[22px] items-center pr-1">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!closed}
          className="flex h-full flex-1 items-center gap-0.5 pl-0.5 text-left label-mono text-foreground focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-ring"
        >
          <ChevronRight className={cn('size-4 transition-transform duration-100', !closed && 'rotate-90')} />
          <span className="hidden">{icon}</span>
          {title}
          <span className="ml-1.5">{badge}</span>
        </button>
        <span className="opacity-0 transition-opacity group-hover/pane:opacity-100 focus-within:opacity-100">{action}</span>
      </div>
      <div className={cn('grid transition-[grid-template-rows] duration-200 ease-out', closed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]')}>
        <div className="min-h-0 overflow-hidden">
          <div className="flex flex-col gap-2.5 px-3 pt-1 pb-3">{children}</div>
        </div>
      </div>
    </section>
  )
}

export function Sidebar(p: SidebarProps): ReactNode {
  const [adding, setAdding] = useState(false)
  const [devPairing, setDevPairing] = useState(false)
  const floating = p.layout === 'floating'
  const open = p.settings.sidebarOpen
  const closed = new Set(p.settings.closedSections)
  const toggleSection = (id: string): void => {
    const next = new Set(closed)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    p.onSettingsChange({ closedSections: [...next] })
  }
  const deviceCount = p.list?.devices.length ?? 0

  return (
    <aside
      aria-hidden={!open}
      className={cn(
        'z-30 flex flex-col overflow-hidden bg-sidebar transition-[width,transform,opacity] duration-200 ease-out',
        floating
          ? 'absolute top-[35px] bottom-[22px] left-12 w-72 border-r border-sidebar-border shadow-2xl'
          : 'relative col-start-2 row-start-2 min-h-0 shrink-0 border-r border-sidebar-border',
        floating
          ? open
            ? 'translate-x-0 opacity-100'
            : 'pointer-events-none -translate-x-4 opacity-0'
          : open
            ? 'w-72'
            : 'w-0 border-r-0',
      )}
    >
      {/* Fixed inner width: content doesn't reflow while the docked width animates. */}
      <div className="flex h-full w-72 flex-col">
        {/* View title, like VS Code's "EXPLORER": caps on the left, view actions on the right. */}
        <header className="group/title flex h-[35px] shrink-0 items-center gap-0.5 pr-2 pl-5">
          <span className="mr-auto text-[11px] tracking-[0.02em] text-foreground/80 uppercase">{{ phones: 'Phones', tests: 'Tests', design: 'Design check', agents: 'Agents' }[p.view]}</span>
          {p.view === 'phones' && (
            <IconButton label="Refresh phones" size="icon-xs" className="[&_svg]:size-4" onClick={p.refresh}>
              <RefreshCw />
            </IconButton>
          )}
          <IconButton
            label={p.layoutLocked ? 'Widen the window to dock the side bar' : floating ? 'Dock side bar' : 'Float side bar over the mirror'}
            disabled={p.layoutLocked}
            shortcut="⌥⌘\"
            size="icon-xs"
            className="[&_svg]:size-4"
            onClick={() => p.onSettingsChange({ sidebarLayout: floating ? 'docked' : 'floating' })}
          >
            {floating ? <Pin /> : <PinOff />}
          </IconButton>
          <IconButton label="Hide side bar" shortcut="⌘\" size="icon-xs" className="[&_svg]:size-4" onClick={() => p.onSettingsChange({ sidebarOpen: false })}>
            <PanelLeftClose />
          </IconButton>
        </header>

        {/* Plain overflow container: Radix ScrollArea's display:table wrapper defeats text truncation. */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {p.view === 'phones' && (
          <>
          <Section
            title="Devices"
            icon={<Smartphone />}
            badge={deviceCount > 0 && <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">{deviceCount}</Badge>}
            action={
              <IconButton label="Add phone" size="icon-xs" className="[&_svg]:size-4" onClick={() => setAdding(true)}>
                <Plus />
              </IconButton>
            }
            closed={closed.has('devices')}
            onToggle={() => toggleSection('devices')}
          >
            {p.error && (
              <Alert variant="destructive">
                <AlertTriangle />
                <AlertDescription>{p.error}</AlertDescription>
              </Alert>
            )}
            {p.list && p.list.devices.length === 0 && p.list.other.length === 0 && (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="flex flex-col items-center gap-2 rounded-[4px] border border-dashed p-5 text-center text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
              >
                <Smartphone className="size-6" />
                Plug in a phone with USB debugging on, or add a wireless device.
              </button>
            )}
            {p.list?.devices.map((d) => (
              <DeviceCard key={d.id} device={d} activeSerial={p.activeSerial} connecting={p.connecting} onMirror={p.onMirror} />
            ))}
            {p.list?.other.map((t) => (
              <div key={t.serial} className="rounded-[4px] border border-dashed p-3 text-xs">
                <div className="truncate font-medium">{t.serial}</div>
                <div className="text-muted-foreground">
                  {t.state}. {stateHint(t.state)}
                </div>
              </div>
            ))}
          </Section>

          <Section
            title="Display"
            icon={<MonitorSmartphone />}
            closed={closed.has('display')}
            onToggle={() => toggleSection('display')}
          >
            <div className="grid gap-1.5">
              <Label className="text-xs font-normal">Quality</Label>
              <Select value={p.settings.quality} onValueChange={(v) => p.onSettingsChange({ quality: v as Quality })}>
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue>{QUALITY_SHORT[p.settings.quality]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(QUALITY_LABELS) as Quality[]).map((q) => (
                    <SelectItem key={q} value={q}>
                      {QUALITY_LABELS[q]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs font-normal">Codec</Label>
              <Select value={p.settings.codec} onValueChange={(v) => p.onSettingsChange({ codec: v as CodecPreference })}>
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue>{CODEC_SHORT[p.settings.codec]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto (H.265 when supported)</SelectItem>
                  <SelectItem value="h265">H.265: sharper at the same bitrate</SelectItem>
                  <SelectItem value="h264">H.264: most compatible</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="show-touches" className="text-xs font-normal">
                Show touches on the mirror
              </Label>
              <Switch
                id="show-touches"
                checked={p.settings.showTouches}
                onCheckedChange={(v) => p.onSettingsChange({ showTouches: v })}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">Changes apply to the live mirror right away.</p>
          </Section>

          <Section title="Audio" icon={<Volume2 />} closed={closed.has('audio')} onToggle={() => toggleSection('audio')}>
            <Select value={p.settings.audio} onValueChange={(v) => p.onSettingsChange({ audio: v as AudioMode })}>
              <SelectTrigger size="sm" className="w-full">
                <SelectValue>{AUDIO_SHORT[p.settings.audio]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="off">Off</SelectItem>
                <SelectItem value="mac">Play on this Mac (phone muted)</SelectItem>
                <SelectItem value="both">Mac + phone (Android 13+)</SelectItem>
              </SelectContent>
            </Select>
          </Section>

          </>
          )}
          {p.view === 'tests' && <TestsView target={p.target} onRecord={p.onRecord} />}
          {p.view === 'design' && <DesignView target={p.target} />}
          {p.view === 'agents' && (
            <Section title="Agent access" icon={<Bot />} closed={closed.has('agent-view')} onToggle={() => toggleSection('agent-view')}>
              <AgentAccess />
            </Section>
          )}
        </div>

        {!p.adb?.adbPath && (
          <footer className="shrink-0 border-t border-sidebar-border px-4 py-2">
            <p className="text-[12px] text-warning">adb not found: brew install android-platform-tools</p>
          </footer>
        )}
      </div>

      {/* "+" opens Add phone (Wi-Fi no setup first); its Developer path leads to wireless debugging pairing. */}
      <AddPhoneSheet
        open={adding}
        onOpenChange={setAdding}
        onDeveloper={() => {
          setAdding(false)
          setDevPairing(true)
        }}
      />
      <AddDeviceDialog open={devPairing} onOpenChange={setDevPairing} />
    </aside>
  )
}
