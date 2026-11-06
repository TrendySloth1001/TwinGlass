import {
  AppWindow,
  ArrowLeft,
  BellDot,
  Camera,
  Circle,
  ClipboardList,
  ClipboardPaste,
  Copy,
  ExternalLink,
  House,
  Laptop,
  LockKeyholeOpen,
  MonitorUp,
  RefreshCw,
  RotateCw,
  Settings2,
  Smartphone,
  SquareStack,
  Trash2,
} from 'lucide-react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import type { ClipItemInfo, PhoneAppInfo } from '../../../preload/api'
import type { DeviceAction } from '@shared/shortcuts'
import { shortcutFor } from '@shared/shortcuts'
import {
  CommandDialog,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command'
import { matchScore } from '@/lib/rank'

export type PaletteMode = 'all' | 'clipboard'

const ACTIONS: { action: DeviceAction; label: string; icon: ReactNode }[] = [
  { action: 'home', label: 'Home', icon: <House /> },
  { action: 'back', label: 'Back', icon: <ArrowLeft /> },
  { action: 'recents', label: 'Recent apps', icon: <SquareStack /> },
  { action: 'notifications', label: 'Notifications panel', icon: <BellDot /> },
  { action: 'quickSettings', label: 'Quick settings', icon: <Settings2 /> },
  { action: 'screenshot', label: 'Screenshot', icon: <Camera /> },
  { action: 'record', label: 'Record video', icon: <Circle /> },
  { action: 'rotate', label: 'Rotate', icon: <RotateCw /> },
  { action: 'unlock', label: 'Unlock phone', icon: <LockKeyholeOpen /> },
]

/** Same rule as main's openableUrl (kept in sync by hand: tiny and display-only here). */
const looksLikeLink = (t: string): boolean =>
  !/\s/.test(t.trim()) && (/^(https?:\/\/|mailto:|tel:|geo:|market:\/\/)/i.test(t.trim()) || /^(www\.)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(t.trim()))

const short = (t: string, n = 80): string => {
  const one = t.replace(/\s+/g, ' ').trim()
  return one.length > n ? `${one.slice(0, n)}…` : one
}

function ago(at: number): string {
  const s = Math.round((Date.now() - at) / 1000)
  if (s < 60) return 'now'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

interface CommandPaletteProps {
  open: boolean
  mode: PaletteMode
  onOpenChange: (open: boolean) => void
  /** A phone is mirrored (apps / sending need it). */
  live: boolean
  onAction: (a: DeviceAction) => void
  onToggleMacScreen: (mode: 'mirror' | 'extend') => void
  macScreenRunning: boolean
}

/**
 * ⌘K: one search box for the phone. Type an app name and press Enter to open it; paste a link to
 * open it on the phone, or any text to put it on the phone's clipboard; pick from the clipboard
 * history; or run a phone action. ⇧⌘V opens it on the clipboard history.
 */
export function CommandPalette({ open, mode, onOpenChange, live, onAction, onToggleMacScreen, macScreenRunning }: CommandPaletteProps): ReactNode {
  const [query, setQuery] = useState('')
  const [apps, setApps] = useState<PhoneAppInfo[] | null>(null)
  const [appsError, setAppsError] = useState<string | null>(null)
  const [clips, setClips] = useState<{ enabled: boolean; items: ClipItemInfo[] }>({ enabled: true, items: [] })

  const loadApps = useCallback((fresh = false) => {
    setAppsError(null)
    if (fresh) setApps(null)
    window.mobMirror.listApps(fresh).then(setApps, (e: unknown) => setAppsError(e instanceof Error ? e.message : String(e)))
  }, [])

  // Reset the search only when the palette opens. (Resetting on a reconnect too would re-target ↵
  // to whatever is first in the unfiltered list while the user is typing.)
  useEffect(() => {
    if (open) setQuery('')
  }, [open])

  useEffect(() => {
    if (!open) return
    void window.mobMirror.clipboardHistory().then(setClips)
    if (live && mode === 'all') loadApps()
    return window.mobMirror.onClipboardHistoryChanged(() => void window.mobMirror.clipboardHistory().then(setClips))
  }, [open, live, mode, loadApps])

  const close = (): void => onOpenChange(false)
  const run = (fn: () => Promise<unknown> | void): void => {
    close()
    void Promise.resolve(fn()).catch((e: unknown) => toast.error(e instanceof Error ? e.message : String(e)))
  }

  const send = (text: string, how: 'auto' | 'copy' | 'paste'): void =>
    run(async () => {
      const r = await window.mobMirror.sendToPhone(text, how)
      toast.success(r.kind === 'opened' ? 'Opened on the phone' : r.kind === 'pasted' ? 'Pasted on the phone' : 'Copied to the phone')
    })

  const useClip = (it: ClipItemInfo): void =>
    run(async () => {
      await window.mobMirror.useClipboardItem(it.id)
      if (live) await window.mobMirror.sendToPhone(it.text, 'copy')
      toast.success(live ? 'Copied on the Mac and the phone' : 'Copied')
    })

  const q = query.trim()

  // ---- ranking (our own: cmdk's default keeps groups in place, so a weak app match beat "Home") ----
  type Row = { key: string; score: number; node: ReactNode }
  const rows = (list: Row[]): Row[] => list.filter((r) => r.score > 0).sort((a, b) => b.score - a.score)

  const appRows: Row[] =
    mode === 'all' && live && apps
      ? rows(
          apps.map((a) => ({
            key: a.pkg,
            // Labels count fully, package names half; user apps win ties over system apps.
            score: ((m) => (m > 0 && !a.system ? m + 0.5 : m))(Math.max(matchScore(a.label, q), matchScore(a.pkg, q) * 0.5)),
            node: (
              <CommandItem
                key={a.pkg}
                value={`app:${a.pkg}`}
                onSelect={() =>
                  run(async () => {
                    await window.mobMirror.launchApp(a.pkg)
                    toast.success(`Opening ${a.label}`)
                  })
                }
              >
                <AppWindow />
                <span className="truncate">{a.label}</span>
                <span className="ml-auto truncate pl-2 text-[11px] text-muted-foreground">{a.pkg}</span>
              </CommandItem>
            ),
          })),
        )
      : []

  const macLabel = macScreenRunning ? 'Stop Mac screen on phone' : 'Show Mac screen on phone'
  const extLabel = macScreenRunning ? 'Stop Mac screen on phone' : 'Use phone as a second display'
  const actionRows: Row[] =
    mode === 'all' && live
      ? rows([
          {
            key: 'extend',
            score: Math.max(matchScore(extLabel, q), matchScore('extend second display monitor screen', q)),
            node: (
              <CommandItem key="extend" value="action:extend" onSelect={() => run(() => onToggleMacScreen('extend'))}>
                <MonitorUp /> {extLabel}
                <CommandShortcut>⇧⌥⌘P</CommandShortcut>
              </CommandItem>
            ),
          },
          {
            key: 'mac-screen',
            score: Math.max(matchScore(macLabel, q), matchScore('mac screen display share cast', q)),
            node: (
              <CommandItem key="mac-screen" value="action:mac-screen" onSelect={() => run(() => onToggleMacScreen('mirror'))}>
                <MonitorUp /> {macLabel}
                <CommandShortcut>⌥⌘P</CommandShortcut>
              </CommandItem>
            ),
          },
          ...ACTIONS.map((a) => ({
            key: a.action,
            // +1 on a real match: "home" means the Home button rather than an app called Home.
            score: ((m) => (m > 0 && q ? m + 1 : m))(matchScore(a.label, q)),
            node: (
              <CommandItem key={a.action} value={`action:${a.action}`} onSelect={() => run(() => onAction(a.action))}>
                {a.icon} {a.label}
                <CommandShortcut>{shortcutFor(a.action)}</CommandShortcut>
              </CommandItem>
            ),
          })),
        ])
      : []

  const clipSource = mode === 'clipboard' ? clips.items : q ? clips.items : clips.items.slice(0, 6)
  const clipRows: Row[] = clips.enabled
    ? rows(
        clipSource.map((it, n) => ({
          key: `clip-${it.id}`,
          // Clipboard text ranks a little lower than apps/actions; newest first among equals.
          score: matchScore(it.text, q) * (mode === 'clipboard' ? 1 : 0.6) - n * 0.001,
          node: (
            <CommandItem key={it.id} value={`clip:${it.id}`} onSelect={() => useClip(it)}>
              {it.source === 'phone' ? <Smartphone /> : <Laptop />}
              <span className="truncate">{short(it.text)}</span>
              <span className="ml-auto shrink-0 pl-2 text-[11px] text-muted-foreground">{ago(it.at)}</span>
            </CommandItem>
          ),
        })),
      )
    : []

  // Groups ordered by their best match (without a query: apps, clipboard, phone).
  const groups = [
    { id: 'apps', heading: 'Apps', rows: appRows, base: 3 },
    { id: 'clip', heading: mode === 'clipboard' ? `Clipboard history · ${clips.items.length}` : 'Clipboard', rows: clipRows, base: 2 },
    { id: 'phone', heading: 'Phone', rows: actionRows, base: 1 },
  ]
    .filter((g) => g.rows.length)
    .sort((a, b) => (q ? (b.rows[0]!.score - a.rows[0]!.score) : b.base - a.base))
  const nothing = !groups.length && !(live && q && mode === 'all')

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title={mode === 'clipboard' ? 'Clipboard history' : 'Command palette'}
      description="Search apps, send to the phone, clipboard history"
      className="sm:max-w-lg"
      commandProps={{ shouldFilter: false }}
    >
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder={mode === 'clipboard' ? 'Search clipboard history…' : live ? 'Open an app, paste a link, search…' : 'Search… (mirror a phone for apps)'}
      />
      <CommandList className="max-h-[min(420px,60vh)]">
        {nothing && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            {mode === 'clipboard' && !clips.items.length ? 'Nothing copied yet.' : 'No matches.'}
          </div>
        )}

        {/* A link opens first: ↵ on a pasted URL opens it on the phone. */}
        {live && q && mode === 'all' && looksLikeLink(q) && (
          <CommandGroup heading="Open on phone">
            <CommandItem value="open:link" onSelect={() => send(q, 'auto')}>
              <ExternalLink /> Open <span className="truncate font-medium">{short(q, 48)}</span> on the phone
              <CommandShortcut>↵</CommandShortcut>
            </CommandItem>
          </CommandGroup>
        )}

        {mode === 'all' && live && !apps && (
          <CommandGroup heading="Apps">
            {appsError ? (
              <CommandItem value="apps:retry" onSelect={() => loadApps(true)}>
                <RefreshCw /> {appsError} Retry
              </CommandItem>
            ) : (
              <CommandItem disabled value="apps:loading">
                <RefreshCw className="animate-spin" /> Reading apps from the phone…
              </CommandItem>
            )}
          </CommandGroup>
        )}

        {groups.map((g, n) => (
          <div key={g.id}>
            {n > 0 && <CommandSeparator />}
            <CommandGroup heading={g.heading}>
              {(q || mode === 'clipboard' ? g.rows : g.rows.slice(0, g.id === 'apps' ? 200 : 12)).map((r) => r.node)}
              {g.id === 'apps' && !q && (
                <CommandItem value="apps:refresh" onSelect={() => loadApps(true)}>
                  <RefreshCw /> Refresh app list
                </CommandItem>
              )}
              {g.id === 'clip' && mode === 'clipboard' && (
                <CommandItem value="clip:clear" onSelect={() => run(() => window.mobMirror.clearClipboardHistory())}>
                  <Trash2 /> Clear clipboard history
                </CommandItem>
              )}
            </CommandGroup>
          </div>
        ))}

        {!clips.enabled && mode === 'clipboard' && (
          <CommandGroup heading="Clipboard history">
            <CommandItem disabled value="clip:off">
              <ClipboardList /> Clipboard history is off (Settings → Mouse & keyboard).
            </CommandItem>
          </CommandGroup>
        )}

        {/* Catch-all last: only when nothing better matched does ↵ copy the text. */}
        {live && q && mode === 'all' && (
          <CommandGroup heading="Send to phone">
            <CommandItem value="send:copy" onSelect={() => send(q, 'copy')}>
              <Copy /> Copy “{short(q, 40)}” to the phone
            </CommandItem>
            <CommandItem value="send:paste" onSelect={() => send(q, 'paste')}>
              <ClipboardPaste /> Paste “{short(q, 40)}” into the phone
            </CommandItem>
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  )
}
