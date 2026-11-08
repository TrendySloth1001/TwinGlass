import { Download, Loader2, RefreshCw, Search, Sparkles, X } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import type { PhoneAppInfo } from '../../../preload/api'
import { Button } from '@/components/ui/button'
import { matchScore } from '@/lib/rank'
import { cn } from '@/lib/utils'

/** Stable colour per app (hash of the package name), for its letter tile. */
export function tileColor(pkg: string): string {
  let h = 0
  for (const c of pkg) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return `oklch(0.62 0.15 ${h % 360})`
}

/**
 * The second screen's home screen: every app on the phone, searchable. Tapping one opens it on the
 * second screen (START_APP goes to the mirrored display). Shown when a second screen opens without
 * an app, and whenever Home is pressed there: Android's own secondary-display launcher on many
 * phones (e.g. Nothing OS) is just an empty wallpaper.
 */
/** Icons: none yet → loading them from the phone app, or it isn't installed (offer to install). */
type IconState = 'unknown' | 'loading' | 'need-app' | 'installing' | 'done' | 'failed'

export function AppGrid({ onClose, phoneName, serial }: { onClose: () => void; phoneName: string; serial?: string }): ReactNode {
  const [apps, setApps] = useState<PhoneAppInfo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [icons, setIcons] = useState<IconState>('unknown')
  const load = (fresh = false): Promise<void> => {
    setError(null)
    return window.mobMirror.listApps(fresh).then(
      (a) => {
        setApps(a)
        setError(null)
      },
      (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
    )
  }
  useEffect(() => void load(), [])

  /** Pull real icons from the Twinglass phone app, then re-read the list (it carries them). */
  const fetchIcons = async (): Promise<void> => {
    if (!serial) return
    setIcons('loading')
    try {
      const n = await window.mobMirror.fetchAppIcons(serial)
      setIcons(n > 0 ? 'done' : 'failed')
      if (n > 0) await load()
    } catch (e) {
      setIcons(String(e).includes('no-companion') ? 'need-app' : 'failed')
    }
  }
  // First time on this phone: no icons cached yet. If the phone app is there, just load them.
  const noIcons = !!apps && apps.length > 0 && !apps.some((a) => a.icon)
  useEffect(() => {
    if (noIcons && icons === 'unknown') void fetchIcons()
  }, [noIcons, icons])

  /** Only on the user's click: installs the small Twinglass app on the phone, then loads icons. */
  const install = async (): Promise<void> => {
    if (!serial) return
    setIcons('installing')
    try {
      await window.mobMirror.companionInstall(serial)
      await fetchIcons()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
      setIcons('need-app')
    }
  }

  const shown = useMemo(() => {
    if (!apps) return []
    const user = apps.filter((a) => !a.system)
    const sys = apps.filter((a) => a.system)
    const all = [...user, ...sys]
    if (!q.trim()) return all
    return all
      .map((a) => ({ a, s: Math.max(matchScore(a.label, q), matchScore(a.pkg, q) * 0.5) }))
      .filter((x) => x.s > 0)
      .sort((x, y) => y.s - x.s)
      .map((x) => x.a)
  }, [apps, q])

  const open = (a: PhoneAppInfo): void => {
    onClose()
    window.mobMirror.launchApp(a.pkg).then(
      () => toast.success(`Opening ${a.label} on the second screen`),
      (e: unknown) => toast.error(e instanceof Error ? e.message : String(e)),
    )
  }

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-background/95 backdrop-blur-md">
      <div className="flex items-center gap-2 px-4 pt-4 pb-3">
        <div className="flex h-10 flex-1 items-center gap-2 rounded-full border bg-card px-4">
          <Search className="size-4 text-muted-foreground" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && shown[0]) open(shown[0])
              if (e.key === 'Escape') onClose()
            }}
            placeholder={`Search apps on ${phoneName}`}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <Button size="icon" variant="ghost" aria-label="Close apps" onClick={onClose}>
          <X />
        </Button>
      </div>

      {noIcons && (icons === 'need-app' || icons === 'installing' || icons === 'loading') && (
        <div className="mx-4 mb-3 flex items-center gap-3 rounded-xl border bg-card px-3 py-2 text-xs">
          <Sparkles className="size-4 shrink-0 text-muted-foreground" />
          {icons === 'loading' ? (
            <span className="flex-1 text-muted-foreground">Loading app icons from the phone…</span>
          ) : (
            <>
              <span className="flex-1 text-muted-foreground">Real app icons need the small Twinglass app on your phone.</span>
              <Button size="sm" variant="outline" disabled={icons === 'installing'} onClick={() => void install()}>
                {icons === 'installing' ? <Loader2 className="animate-spin" /> : <Download />} Install
              </Button>
            </>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
        {!apps && !error && (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading apps…
          </div>
        )}
        {error && !apps && (
          <div className="flex flex-col items-center gap-3 py-16 text-sm text-muted-foreground">
            {error}
            <Button size="sm" variant="outline" onClick={() => void load(true)}>
              <RefreshCw /> Try again
            </Button>
          </div>
        )}
        {apps && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(76px,1fr))] gap-x-2 gap-y-4">
            {shown.map((a, i) => (
              <button
                key={a.pkg}
                type="button"
                onClick={() => open(a)}
                title={a.pkg}
                className={cn('group flex flex-col items-center gap-1.5 rounded-xl p-1.5 transition-colors hover:bg-accent', q && i === 0 && 'bg-accent')}
              >
                {a.icon ? (
                  <img src={a.icon} alt="" draggable={false} className="size-12 drop-shadow-sm transition-transform group-hover:scale-105" />
                ) : (
                  <span
                    className="grid size-12 place-items-center rounded-2xl text-lg font-semibold text-white shadow-sm transition-transform group-hover:scale-105"
                    style={{ background: tileColor(a.pkg) }}
                  >
                    {a.label.trim().charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="line-clamp-2 w-full text-center text-[11px] leading-tight">{a.label}</span>
              </button>
            ))}
            {!shown.length && <div className="col-span-full py-10 text-center text-sm text-muted-foreground">No app matches “{q}”.</div>}
          </div>
        )}
      </div>
    </div>
  )
}
