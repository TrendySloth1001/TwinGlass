import { Bot, Fingerprint, Info, MonitorSmartphone, RefreshCw, SlidersHorizontal, Volume2 } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import type { AdbStatusInfo, UnlockStatusInfo } from '../../../preload/api'
import type { AudioMode } from '@shared/ipc'
import { QUALITY_LABELS, type CodecPreference, type Quality } from '@shared/quality'
import { AgentAccess } from '@/components/agent-access'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { Settings } from '@/hooks/use-settings'
import type { ThemePref } from '@/hooks/use-theme'
import { cn } from '@/lib/utils'

type Page = 'general' | 'display' | 'audio' | 'unlock' | 'agents' | 'about'

const PAGES: { id: Page; label: string; icon: ReactNode }[] = [
  { id: 'general', label: 'General', icon: <SlidersHorizontal /> },
  { id: 'display', label: 'Display', icon: <MonitorSmartphone /> },
  { id: 'audio', label: 'Audio', icon: <Volume2 /> },
  { id: 'unlock', label: 'Unlock', icon: <Fingerprint /> },
  { id: 'agents', label: 'Agents', icon: <Bot /> },
  { id: 'about', label: 'About', icon: <Info /> },
]

/** One setting: label and explanation on the left, the control on the right. */
function Row({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }): ReactNode {
  return (
    // Wraps: the control drops under its label when the dialog is narrow (compact window).
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3">
      <div className="min-w-48 flex-1">
        <div className="text-[13px] font-medium">{label}</div>
        {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function Group({ title, children }: { title?: string; children: ReactNode }): ReactNode {
  return (
    <section className="mb-5">
      {title && <h3 className="mb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>}
      <div className="divide-y rounded-xl border bg-card px-4">{children}</div>
    </section>
  )
}

function Choice<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}): ReactNode {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as T)}>
      <SelectTrigger size="sm" className="w-56">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  settings: Settings
  /** Same path as the sidebar: stream settings restart a live mirror with the new values. */
  onSettingsChange: (patch: Partial<Settings>) => void
  adb: AdbStatusInfo | null
  refreshDevices: () => void
  /** A phone is mirrored (unlock status is per phone). */
  live: boolean
}

export function SettingsDialog(p: SettingsDialogProps): ReactNode {
  const [page, setPage] = useState<Page>('general')
  const s = p.settings
  const set = p.onSettingsChange

  // Unlock status of the mirrored phone, refreshed whenever the page is shown.
  const [unlock, setUnlock] = useState<UnlockStatusInfo | null>(null)
  useEffect(() => {
    if (!p.open || page !== 'unlock' || !p.live) return
    void window.mobMirror.unlockStatus().then(setUnlock, () => setUnlock(null))
  }, [p.open, page, p.live])

  const restartAdb = (): void => {
    const id = toast.loading('Restarting the adb server…')
    window.mobMirror.restartAdbServer().then(
      (st) => {
        toast.success(`adb server ${st.serverVersion ?? ''} running`, { id, description: 'Phones reconnect automatically.' })
        p.refreshDevices()
      },
      (e: unknown) => toast.error('Could not restart adb', { id, description: String(e) }),
    )
  }

  return (
    <Dialog open={p.open} onOpenChange={p.onOpenChange}>
      <DialogContent className="@container flex h-[min(560px,calc(100vh-48px))] w-[min(760px,calc(100vw-32px))] max-w-none gap-0 overflow-hidden p-0 sm:max-w-none">
        <nav className="flex w-12 shrink-0 flex-col gap-0.5 border-r bg-sidebar p-2 pt-4 @2xl:w-44">
          <DialogTitle className="sr-only px-2 pb-3 text-sm @2xl:not-sr-only">Settings</DialogTitle>
          <DialogDescription className="sr-only">Mob Mirror preferences</DialogDescription>
          {PAGES.map((pg) => (
            <button
              key={pg.id}
              type="button"
              onClick={() => setPage(pg.id)}
              title={pg.label}
              aria-label={pg.label}
              className={cn(
                'flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-accent [&_svg]:size-4 [&_svg]:text-muted-foreground',
                page === pg.id && 'bg-accent font-medium',
              )}
            >
              {pg.icon}
              <span className="hidden @2xl:inline">{pg.label}</span>
            </button>
          ))}
        </nav>

        <div className="min-w-0 flex-1 overflow-y-auto p-4 @2xl:p-6">
          <h2 className="mb-4 text-base font-semibold">{PAGES.find((x) => x.id === page)?.label}</h2>

          {page === 'general' && (
            <>
              <Group title="Appearance">
                <Row label="Theme" hint="System follows the macOS appearance.">
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    size="sm"
                    value={s.theme}
                    onValueChange={(v) => v && set({ theme: v as ThemePref })}
                  >
                    <ToggleGroupItem value="system">System</ToggleGroupItem>
                    <ToggleGroupItem value="light">Light</ToggleGroupItem>
                    <ToggleGroupItem value="dark">Dark</ToggleGroupItem>
                  </ToggleGroup>
                </Row>
              </Group>
              <Group title="Window">
                <Row label="While mirroring" hint="Compact is a phone-shaped window with a control strip. ⇧⌘M switches.">
                  <Choice
                    value={s.viewMode}
                    onChange={(v) => set({ viewMode: v })}
                    options={[
                      { value: 'compact', label: 'Compact mirror' },
                      { value: 'full', label: 'Full view' },
                    ]}
                  />
                </Row>
                <Row label="Sidebar" hint="Floating sits over the mirror and takes no space. ⌥⌘\ switches.">
                  <Choice
                    value={s.sidebarLayout}
                    onChange={(v) => set({ sidebarLayout: v })}
                    options={[
                      { value: 'docked', label: 'Docked' },
                      { value: 'floating', label: 'Floating' },
                    ]}
                  />
                </Row>
              </Group>
              <Group title="Connection">
                <Row label="Connect automatically" hint="Mirror the last phone (or the only phone) as soon as it appears.">
                  <Switch checked={s.autoConnect} onCheckedChange={(v) => set({ autoConnect: v })} />
                </Row>
              </Group>
            </>
          )}

          {page === 'display' && (
            <Group>
              <Row label="Quality" hint="Auto: High over USB, Balanced over Wi-Fi.">
                <Choice
                  value={s.quality}
                  onChange={(v) => set({ quality: v as Quality })}
                  options={(Object.keys(QUALITY_LABELS) as Quality[]).map((q) => ({ value: q, label: QUALITY_LABELS[q] }))}
                />
              </Row>
              <Row label="Codec" hint="H.265 is sharper at the same bitrate; decoded in hardware on Apple Silicon.">
                <Choice
                  value={s.codec}
                  onChange={(v) => set({ codec: v as CodecPreference })}
                  options={[
                    { value: 'auto', label: 'Auto (H.265 when supported)' },
                    { value: 'h265', label: 'H.265' },
                    { value: 'h264', label: 'H.264 (most compatible)' },
                  ]}
                />
              </Row>
              <Row label="Show touches" hint="Draws a dot where each click or touch lands.">
                <Switch checked={s.showTouches} onCheckedChange={(v) => set({ showTouches: v })} />
              </Row>
            </Group>
          )}

          {page === 'audio' && (
            <Group>
              <Row label="Phone audio" hint="Changes apply to the live mirror right away.">
                <Choice
                  value={s.audio}
                  onChange={(v) => set({ audio: v as AudioMode })}
                  options={[
                    { value: 'off', label: 'Off' },
                    { value: 'mac', label: 'Play on this Mac (phone muted)' },
                    { value: 'both', label: 'Mac + phone (Android 13+)' },
                  ]}
                />
              </Row>
            </Group>
          )}

          {page === 'unlock' &&
            (p.live ? (
              <Group title="Mirrored phone">
                <Row label="Lock type" hint="The PIN screen is hidden from capture, so the PIN is typed for you.">
                  <span className="text-xs text-muted-foreground">{unlock?.credential ?? '…'}</span>
                </Row>
                <Row
                  label="Saved PIN"
                  hint={
                    unlock?.saved
                      ? 'Stored in your macOS Keychain. Released only after Touch ID.'
                      : 'Unlock once with ⌘L and tick “Remember” to save it.'
                  }
                >
                  {unlock?.saved ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive"
                      onClick={() =>
                        void window.mobMirror.forgetUnlockSecret().then(async () => {
                          setUnlock(await window.mobMirror.unlockStatus())
                          toast.success('Saved PIN removed')
                        })
                      }
                    >
                      Forget
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">Not saved</span>
                  )}
                </Row>
                <Row label="Touch ID" hint="Asked for directly when you press ⌘L.">
                  <span className="text-xs text-muted-foreground">{unlock ? (unlock.touchId ? 'Available' : 'Not available') : '…'}</span>
                </Row>
              </Group>
            ) : (
              <p className="text-sm text-muted-foreground">Mirror a phone to see and manage its unlock settings.</p>
            ))}

          {page === 'agents' && (
            <Group>
              <div className="py-3">
                <AgentAccess />
              </div>
            </Group>
          )}

          {page === 'about' && (
            <Group title="adb">
              <Row label="adb" hint={<span className="font-mono">{p.adb?.adbPath ?? 'not found: brew install android-platform-tools'}</span>}>
                <span className="text-xs text-muted-foreground">{p.adb?.clientVersion ?? '—'}</span>
              </Row>
              <Row
                label="adb server"
                hint={
                  p.adb?.serverVersion && p.adb.clientVersion && p.adb.serverVersion !== p.adb.clientVersion
                    ? 'Started by another tool with an older adb. Restart it to use this one.'
                    : 'Background service that talks to your phones.'
                }
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{p.adb?.serverVersion ?? '—'}</span>
                  <Button size="sm" variant="outline" onClick={restartAdb}>
                    <RefreshCw /> Restart
                  </Button>
                </div>
              </Row>
            </Group>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
