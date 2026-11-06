import {
  AppWindow,
  Bot,
  Fingerprint,
  FolderOpen,
  MonitorSmartphone,
  MousePointer2,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
  Wrench,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import type { AdbStatusInfo, UnlockStatusInfo, UpdateInfo } from '../../../preload/api'
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
import type { PopupPref } from '@/lib/notify'
import { cn } from '@/lib/utils'
import { FRAME_COLORS, FRAME_LABELS, FRAMES, type FrameColor, type FrameStyle } from '@/lib/phone-frames'

/** Miniature of a phone frame for the picker (same proportions as the real one, scaled down). */
function MiniPhone({ style, color }: { style: FrameStyle; color: FrameColor }): ReactNode {
  const c = FRAME_COLORS[color]
  const screen = (
    <div className="relative h-full w-full overflow-hidden bg-gradient-to-b from-indigo-500/70 via-violet-600/60 to-fuchsia-700/60">
      <div className="absolute inset-x-[18%] top-[22%] h-[5%] rounded-full bg-white/40" />
      <div className="absolute inset-x-[30%] top-[31%] h-[3%] rounded-full bg-white/25" />
      <div className="absolute inset-x-[14%] bottom-[9%] grid grid-cols-4 gap-[6%]">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="aspect-square rounded-full bg-white/30" />
        ))}
      </div>
    </div>
  )
  if (style === 'none') return <div className="h-[92px] w-[44px] overflow-hidden rounded-[3px] shadow-sm">{screen}</div>
  const f = FRAMES[style]
  const k = 0.18 // preview scale for the px parts of the frame
  return (
    <div
      className="relative h-[92px] w-[46px] shadow-md"
      style={{
        padding: Math.max(1, f.rim * k * 2),
        borderRadius: style === 'classic' ? 8 : 10,
        background: `linear-gradient(145deg, ${c.light}, ${c.dark})`,
      }}
    >
      <div
        className="relative flex h-full flex-col bg-black"
        style={{ padding: `${f.top * k}px ${f.side * k}px ${f.bottom * k}px`, borderRadius: style === 'classic' ? 7 : 9 }}
      >
        <div className="relative min-h-0 flex-1 overflow-hidden" style={{ borderRadius: style === 'classic' ? 1 : style === 'minimal' ? 5 : 7 }}>
          {screen}
          {f.punchHole && <div className="absolute top-[2%] left-1/2 size-[4px] -translate-x-1/2 rounded-full bg-black" />}
        </div>
        {style === 'classic' && (
          <>
            <div className="absolute top-[3px] left-1/2 h-[2px] w-3 -translate-x-1/2 rounded-full bg-neutral-700" />
            <div className="absolute bottom-[2px] left-1/2 size-[6px] -translate-x-1/2 rounded-full border border-white/25" />
          </>
        )}
      </div>
      <div className="absolute top-[18%] -right-[1.5px] h-[12%] w-[2px] rounded-r-sm" style={{ background: c.dark }} />
      <div className="absolute top-[34%] -right-[1.5px] h-[7%] w-[2px] rounded-r-sm" style={{ background: c.dark }} />
    </div>
  )
}

type Page = 'general' | 'window' | 'mirroring' | 'input' | 'unlock' | 'agents' | 'advanced'

const PAGES: { id: Page; label: string; icon: ReactNode }[] = [
  { id: 'general', label: 'General', icon: <SlidersHorizontal /> },
  { id: 'window', label: 'Window', icon: <AppWindow /> },
  { id: 'mirroring', label: 'Mirroring', icon: <MonitorSmartphone /> },
  { id: 'input', label: 'Mouse & keyboard', icon: <MousePointer2 /> },
  { id: 'unlock', label: 'Unlock', icon: <Fingerprint /> },
  { id: 'agents', label: 'Agents', icon: <Bot /> },
  { id: 'advanced', label: 'Advanced', icon: <Wrench /> },
]

/** One setting: label and explanation, the control beside it (or under it when narrow). */
function Row({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }): ReactNode {
  return (
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

function Choice<T extends string | number>({
  value,
  onChange,
  options,
  disabled,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
  disabled?: boolean
}): ReactNode {
  return (
    <Select
      value={String(value)}
      disabled={disabled}
      onValueChange={(v) => onChange((options.find((o) => String(o.value) === v)?.value ?? v) as T)}
    >
      <SelectTrigger size="sm" className="w-56">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {options.map((o) => (
          <SelectItem key={String(o.value)} value={String(o.value)}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }): ReactNode {
  return <Switch checked={value} onCheckedChange={onChange} />
}

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  settings: Settings
  /** Same path as the sidebar: only stream settings restart a live mirror. */
  onSettingsChange: (patch: Partial<Settings>) => void
  adb: AdbStatusInfo | null
  refreshDevices: () => void
  /** A phone is mirrored (unlock status is per phone). */
  live: boolean
  /** The window is narrower than 900 px: the sidebar always floats there. */
  narrow: boolean
  onReset: () => void
}

/** Everything about how Mob Mirror looks and behaves. Changes apply immediately. */
export function SettingsDialog(p: SettingsDialogProps): ReactNode {
  const [page, setPage] = useState<Page>('general')
  const s = p.settings
  const set = p.onSettingsChange

  const [unlock, setUnlock] = useState<UnlockStatusInfo | null>(null)
  // Launch at login lives in macOS (login items), not in our settings: read it when shown.
  const [loginItem, setLoginItem] = useState<boolean | null>(null)
  const [update, setUpdate] = useState<UpdateInfo | null>(null)
  useEffect(() => {
    if (p.open && page === 'advanced') void window.mobMirror.checkForUpdate().then(setUpdate, () => {})
  }, [p.open, page])
  useEffect(() => {
    if (p.open && page === 'general') void window.mobMirror.setLoginItem().then(setLoginItem, () => setLoginItem(null))
  }, [p.open, page])
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

  const restartNote = p.live ? 'Applies now (the mirror restarts for a second).' : undefined

  return (
    <Dialog open={p.open} onOpenChange={p.onOpenChange}>
      <DialogContent className="@container flex h-[min(600px,calc(100vh-48px))] w-[min(800px,calc(100vw-32px))] max-w-none gap-0 overflow-hidden p-0 sm:max-w-none">
        <nav className="flex w-12 shrink-0 flex-col gap-0.5 border-r bg-sidebar p-2 pt-4 @2xl:w-48">
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
                'flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-accent [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground',
                page === pg.id && 'bg-accent font-medium',
              )}
            >
              {pg.icon}
              <span className="hidden truncate @2xl:inline">{pg.label}</span>
            </button>
          ))}
        </nav>

        <div className="min-w-0 flex-1 overflow-y-auto p-4 @2xl:p-6">
          <h2 className="mb-4 text-base font-semibold">{PAGES.find((x) => x.id === page)?.label}</h2>

          {page === 'general' && (
            <>
              <Group title="Appearance">
                <Row label="Theme" hint="System follows the macOS appearance.">
                  <ToggleGroup type="single" variant="outline" size="sm" value={s.theme} onValueChange={(v) => v && set({ theme: v as ThemePref })}>
                    <ToggleGroupItem value="system">System</ToggleGroupItem>
                    <ToggleGroupItem value="light">Light</ToggleGroupItem>
                    <ToggleGroupItem value="dark">Dark</ToggleGroupItem>
                  </ToggleGroup>
                </Row>
              </Group>
              <Group title="Connection">
                <Row label="Connect automatically" hint="Mirror the last phone (or the only phone) as soon as it appears.">
                  <Toggle value={s.autoConnect} onChange={(v) => set({ autoConnect: v })} />
                </Row>
                <Row label="Reconnect after a drop" hint="If Wi-Fi or the cable drops, keep trying for 90 s (USB or Wi-Fi).">
                  <Toggle value={s.autoReconnect} onChange={(v) => set({ autoReconnect: v })} />
                </Row>
              </Group>
              <Group title="Mac">
                <Row label="Menu bar icon" hint="Your phones with battery and connection, and one-click mirroring.">
                  <Toggle value={s.showTray} onChange={(v) => set({ showTray: v })} />
                </Row>
                <Row label="Launch at login" hint="Start Mob Mirror when you log in to your Mac.">
                  <Switch
                    checked={loginItem === true}
                    disabled={loginItem === null}
                    onCheckedChange={(v) => void window.mobMirror.setLoginItem(v).then(setLoginItem)}
                  />
                </Row>
              </Group>
              <Group title="Notifications">
                <Row label="Pop-up notifications" hint="Everything is always kept in the notification center (bell).">
                  <Choice<PopupPref>
                    value={s.popups}
                    onChange={(v) => set({ popups: v })}
                    options={[
                      { value: 'all', label: 'All' },
                      { value: 'errors', label: 'Errors only' },
                      { value: 'off', label: 'None (bell only)' },
                    ]}
                  />
                </Row>
              </Group>
            </>
          )}

          {page === 'window' && (
            <>
              <Group title="While mirroring">
                <Row label="View" hint="Compact: a phone-shaped window with a control strip. ⇧⌘M switches any time.">
                  <Choice
                    value={s.viewMode}
                    onChange={(v) => set({ viewMode: v })}
                    options={[
                      { value: 'compact', label: 'Compact mirror' },
                      { value: 'full', label: 'Full view' },
                    ]}
                  />
                </Row>
                <Row label="Navigation bar" hint="Back, Home and Recents under the phone in the compact view.">
                  <Toggle value={s.navBar} onChange={(v) => set({ navBar: v })} />
                </Row>
                <Row label="Keep window on top" hint="Stays above other apps, handy while you code.">
                  <Toggle value={s.alwaysOnTop} onChange={(v) => set({ alwaysOnTop: v })} />
                </Row>
              </Group>
              <Group title="Phone frame">
                <div className="py-3">
                  <div className="mb-3 text-xs text-muted-foreground">
                    Draws a phone around the mirror. Its side buttons work (volume, power), and so does Classic’s home button.
                  </div>
                  <div className="grid grid-cols-2 gap-2 @lg:grid-cols-4">
                    {(Object.keys(FRAME_LABELS) as FrameStyle[]).map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => set({ frame: f })}
                        aria-pressed={s.frame === f}
                        className={cn(
                          'flex flex-col items-center gap-2 rounded-lg border p-3 text-center transition-colors hover:bg-accent',
                          s.frame === f && 'border-primary ring-2 ring-primary/20',
                        )}
                      >
                        <MiniPhone style={f} color={s.frameColor} />
                        <span className="text-xs font-medium">{FRAME_LABELS[f].label}</span>
                        <span className="-mt-1.5 text-[10.5px] leading-tight text-muted-foreground">{FRAME_LABELS[f].hint}</span>
                      </button>
                    ))}
                  </div>
                  <div className={cn('mt-3 flex flex-wrap items-center gap-2', s.frame === 'none' && 'pointer-events-none opacity-40')}>
                    <span className="mr-1 text-xs text-muted-foreground">Finish</span>
                    {(Object.keys(FRAME_COLORS) as FrameColor[]).map((c) => (
                      <button
                        key={c}
                        type="button"
                        title={FRAME_COLORS[c].label}
                        aria-label={FRAME_COLORS[c].label}
                        aria-pressed={s.frameColor === c}
                        onClick={() => set({ frameColor: c })}
                        className={cn(
                          'size-6 rounded-full border border-black/15 shadow-sm transition-transform hover:scale-110',
                          s.frameColor === c && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
                        )}
                        style={{ background: `linear-gradient(145deg, ${FRAME_COLORS[c].light}, ${FRAME_COLORS[c].dark})` }}
                      />
                    ))}
                  </div>
                </div>
              </Group>
              <Group title="Full view">
                <Row
                  label="Sidebar"
                  hint={
                    <>
                      Docked: a column beside the mirror. Floating: a panel over the mirror that takes no space. ⌥⌘\ switches.
                      {p.narrow && (
                        <span className="mt-1 block text-warning">This window is narrower than 900 px, so the sidebar floats here anyway.</span>
                      )}
                    </>
                  }
                >
                  <Choice
                    value={s.sidebarLayout}
                    onChange={(v) => set({ sidebarLayout: v, sidebarOpen: true })}
                    options={[
                      { value: 'docked', label: 'Docked' },
                      { value: 'floating', label: 'Floating' },
                    ]}
                  />
                </Row>
                <Row label="Status bar" hint="Resolution, frame rate, codec and latency under the mirror.">
                  <Toggle value={s.showStatusBar} onChange={(v) => set({ showStatusBar: v })} />
                </Row>
              </Group>
            </>
          )}

          {page === 'mirroring' && (
            <>
              <Group title="Video">
                <Row label="Quality" hint={restartNote ?? 'Auto: High over USB, Balanced over Wi-Fi.'}>
                  <Choice
                    value={s.quality}
                    onChange={(v) => set({ quality: v as Quality })}
                    options={(Object.keys(QUALITY_LABELS) as Quality[]).map((q) => ({ value: q, label: QUALITY_LABELS[q] }))}
                  />
                </Row>
                <Row label="Codec" hint="H.265 is sharper at the same bitrate (hardware-decoded on Apple Silicon).">
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
                <Row label="Frame rate limit" hint="Lower saves battery and Wi-Fi bandwidth.">
                  <Choice<number>
                    value={s.maxFps}
                    onChange={(v) => set({ maxFps: v })}
                    options={[
                      { value: 0, label: 'No limit' },
                      { value: 120, label: '120 fps' },
                      { value: 90, label: '90 fps' },
                      { value: 60, label: '60 fps' },
                      { value: 30, label: '30 fps' },
                    ]}
                  />
                </Row>
                <Row label="Show touches" hint="Draws a dot where each click or touch lands.">
                  <Toggle value={s.showTouches} onChange={(v) => set({ showTouches: v })} />
                </Row>
              </Group>
              <Group title="Audio">
                <Row label="Phone audio" hint={restartNote}>
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
              <Group title="Phone while mirroring">
                <Row label="Keep the phone awake" hint="Stops its screen timing out while mirrored (when plugged in).">
                  <Toggle value={s.stayAwake} onChange={(v) => set({ stayAwake: v })} />
                </Row>
                <Row label="Turn the phone's screen off" hint="When mirroring starts. The mirror keeps working; saves battery.">
                  <Toggle value={s.screenOffOnStart} onChange={(v) => set({ screenOffOnStart: v })} />
                </Row>
              </Group>
            </>
          )}

          {page === 'input' && (
            <>
              <Group title="Mouse">
                <Row label="Mouse button shortcuts" hint="Right-click = Back, middle-click = Home, side buttons = Recents / notifications.">
                  <Toggle value={s.mouseShortcuts} onChange={(v) => set({ mouseShortcuts: v })} />
                </Row>
                <Row label="Scroll speed">
                  <Choice<number>
                    value={s.scrollSpeed}
                    onChange={(v) => set({ scrollSpeed: v })}
                    options={[
                      { value: 0.5, label: 'Slow' },
                      { value: 1, label: 'Normal' },
                      { value: 1.5, label: 'Fast' },
                      { value: 2.5, label: 'Very fast' },
                    ]}
                  />
                </Row>
                <Row label="Reverse scroll direction">
                  <Toggle value={s.invertScroll} onChange={(v) => set({ invertScroll: v })} />
                </Row>
              </Group>
              <Group title="Clipboard">
                <Row
                  label="Clipboard history"
                  hint="⇧⌘V or ⌘K to search what you copied on the Mac or the phone. Kept in memory only; password-manager copies are skipped."
                >
                  <Toggle value={s.clipboardHistory} onChange={(v) => set({ clipboardHistory: v })} />
                </Row>
                <Row label="Copy from the phone automatically" hint="Text copied on the phone lands in the Mac clipboard. ⌘V always pastes to the phone.">
                  <Toggle value={s.clipboardSync} onChange={(v) => set({ clipboardSync: v })} />
                </Row>
              </Group>
            </>
          )}

          {page === 'unlock' && (
            <Group title="Saved PIN">
              <Row
                label="Ask for Touch ID first"
                hint="Off: ⌘L types the saved PIN straight away. Agents (MCP) always need Touch ID, whatever this says."
              >
                <Toggle value={s.requireTouchId} onChange={(v) => set({ requireTouchId: v })} />
              </Row>
            </Group>
          )}
          {page === 'unlock' &&
            (p.live ? (
              <Group title="Mirrored phone">
                <Row label="Lock type" hint="The PIN screen is hidden from capture, so Mob Mirror types the PIN for you.">
                  <span className="text-xs text-muted-foreground">{unlock?.credential ?? '…'}</span>
                </Row>
                <Row
                  label="Saved PIN"
                  hint={unlock?.saved ? (s.requireTouchId ? 'Encrypted in your macOS Keychain. Released after Touch ID.' : 'Encrypted in your macOS Keychain. Typed directly with ⌘L.') : 'Unlock once with ⌘L and tick “Remember” to save it.'}
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
                <Row label="Touch ID" hint="Used when “Ask for Touch ID first” is on, and for agent unlocks.">
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

          {page === 'advanced' && (
            <>
              <Group title="Files">
                <Row label="Screenshots" hint="~/Pictures/Mob Mirror">
                  <Button size="sm" variant="outline" onClick={() => void window.mobMirror.openMediaFolder('pictures')}>
                    <FolderOpen /> Open
                  </Button>
                </Row>
                <Row label="Recordings" hint="~/Movies/Mob Mirror">
                  <Button size="sm" variant="outline" onClick={() => void window.mobMirror.openMediaFolder('videos')}>
                    <FolderOpen /> Open
                  </Button>
                </Row>
              </Group>
              <Group title="adb">
                <Row label="adb" hint={<span className="font-mono break-all">{p.adb?.adbPath ?? 'not found: brew install android-platform-tools'}</span>}>
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
              <Group title="Updates">
                <Row
                  label={`Mob Mirror ${update?.current ?? ''}`}
                  hint={
                    !update
                      ? 'Check for a newer version.'
                      : !update.configured
                        ? 'No release feed is set up yet (package.json → mobMirror.updateRepo).'
                        : update.error
                          ? `Couldn’t check: ${update.error}`
                          : update.available
                            ? `${update.latest} is available. Automatic install needs a signed app, so this opens the download.`
                            : 'You’re up to date.'
                  }
                >
                  {update?.available && update.url ? (
                    <Button size="sm" onClick={() => void window.mobMirror.downloadUpdate(update.url!)}>
                      Download {update.latest}
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => void window.mobMirror.checkForUpdate().then(setUpdate)}>
                      <RefreshCw /> Check now
                    </Button>
                  )}
                </Row>
              </Group>
              <Group title="Reset">
                <Row label="Reset all settings" hint="Back to the defaults. Saved PINs and agent access are not touched.">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive"
                    onClick={() => {
                      p.onReset()
                      toast.success('Settings reset to defaults')
                    }}
                  >
                    <RotateCcw /> Reset
                  </Button>
                </Row>
              </Group>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
