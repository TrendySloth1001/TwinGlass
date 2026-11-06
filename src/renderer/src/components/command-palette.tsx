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
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command'

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
}

/**
 * ⌘K: one search box for the phone. Type an app name and press Enter to open it; paste a link to
 * open it on the phone, or any text to put it on the phone's clipboard; pick from the clipboard
 * history; or run a phone action. ⇧⌘V opens it on the clipboard history.
 */
export function CommandPalette({ open, mode, onOpenChange, live, onAction }: CommandPaletteProps): ReactNode {
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
  const clipItems = mode === 'clipboard' ? clips.items : clips.items.slice(0, 6)
  const userApps = apps?.filter((a) => !a.system) ?? []
  const systemApps = apps?.filter((a) => a.system) ?? []

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title={mode === 'clipboard' ? 'Clipboard history' : 'Command palette'}
      description="Search apps, send to the phone, clipboard history"
      className="sm:max-w-lg"
    >
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder={mode === 'clipboard' ? 'Search clipboard history…' : live ? 'Open an app, paste a link, search…' : 'Search… (mirror a phone for apps)'}
      />
      <CommandList className="max-h-[min(420px,60vh)]">
        <CommandEmpty>{mode === 'clipboard' && !clips.items.length ? 'Nothing copied yet.' : 'No matches.'}</CommandEmpty>

        {/* Order matters: cmdk selects the first visible item, and forceMount items keep their
            place. A link opens first; otherwise app matches come before "copy/paste to phone",
            so ↵ on "calc" opens Calculator. */}
        {live && q && mode === 'all' && looksLikeLink(q) && (
          <CommandGroup heading="Open on phone" forceMount>
            <CommandItem value={`~open ${q}`} forceMount onSelect={() => send(q, 'auto')}>
              <ExternalLink /> Open <span className="truncate font-medium">{short(q, 48)}</span> on the phone
              <CommandShortcut>↵</CommandShortcut>
            </CommandItem>
          </CommandGroup>
        )}

        {mode === 'all' && live && (
          <CommandGroup heading="Apps">
            {!apps && !appsError && (
              <CommandItem disabled value="__loading">
                <RefreshCw className="animate-spin" /> Reading apps from the phone…
              </CommandItem>
            )}
            {appsError && (
              <CommandItem value="__retry" onSelect={() => loadApps(true)}>
                <RefreshCw /> {appsError} Retry
              </CommandItem>
            )}
            {[...userApps, ...systemApps].map((a) => (
              <CommandItem
                key={a.pkg}
                value={`${a.label} ${a.pkg}`}
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
            ))}
            {apps && (
              <CommandItem value="__refresh apps reload" onSelect={() => loadApps(true)}>
                <RefreshCw /> Refresh app list
              </CommandItem>
            )}
          </CommandGroup>
        )}

        {live && q && mode === 'all' && (
          <CommandGroup heading="Send to phone" forceMount>
            <CommandItem value="~send copy" forceMount onSelect={() => send(q, 'copy')}>
              <Copy /> Copy “{short(q, 40)}” to the phone
            </CommandItem>
            <CommandItem value="~send paste" forceMount onSelect={() => send(q, 'paste')}>
              <ClipboardPaste /> Paste “{short(q, 40)}” into the phone
            </CommandItem>
          </CommandGroup>
        )}

        {clips.enabled && clipItems.length > 0 && (
          <>
            {mode === 'all' && <CommandSeparator />}
            <CommandGroup heading={mode === 'clipboard' ? `Clipboard history · ${clips.items.length}` : 'Recent clipboard'}>
              {clipItems.map((it) => (
                <CommandItem key={it.id} value={`clip ${it.id} ${it.text.slice(0, 500)}`} onSelect={() => useClip(it)}>
                  {it.source === 'phone' ? <Smartphone /> : <Laptop />}
                  <span className="truncate">{short(it.text)}</span>
                  <span className="ml-auto shrink-0 pl-2 text-[11px] text-muted-foreground">{ago(it.at)}</span>
                </CommandItem>
              ))}
              {mode === 'clipboard' && (
                <CommandItem value="__clear clipboard history" onSelect={() => run(() => window.mobMirror.clearClipboardHistory())}>
                  <Trash2 /> Clear clipboard history
                </CommandItem>
              )}
            </CommandGroup>
          </>
        )}
        {!clips.enabled && mode === 'clipboard' && (
          <CommandGroup heading="Clipboard history">
            <CommandItem disabled value="__off">
              <ClipboardList /> Clipboard history is off (Settings → Mouse & keyboard).
            </CommandItem>
          </CommandGroup>
        )}

        {mode === 'all' && live && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Phone">
              {ACTIONS.map((a) => (
                <CommandItem key={a.action} value={`action ${a.label}`} onSelect={() => run(() => onAction(a.action))}>
                  {a.icon} {a.label}
                  <CommandShortcut>{shortcutFor(a.action)}</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  )
}
