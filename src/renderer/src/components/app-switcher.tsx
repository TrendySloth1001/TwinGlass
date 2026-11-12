import { LayoutGrid, Loader2, Smartphone, X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import type { PhoneAppInfo } from '../../../preload/api'
import { Button } from '@/components/ui/button'
import { tileColor } from '@/components/app-grid'

function AppIcon({ app, size = 'size-14' }: { app: PhoneAppInfo; size?: string }): ReactNode {
  return app.icon ? (
    <img src={app.icon} alt="" draggable={false} className={`${size} drop-shadow-sm`} />
  ) : (
    <span className={`${size} grid place-items-center rounded-[4px] text-xl font-semibold text-white`} style={{ background: tileColor(app.pkg) }}>
      {app.label.trim().charAt(0).toUpperCase()}
    </span>
  )
}

/**
 * The second screen's Recents. Android's own Recents doesn't track second screens ("No recent
 * items"), so Twinglass lists what is open there (front first) and what is open on the phone; a
 * click brings that app to this screen.
 */
export function AppSwitcher({ onClose, onAllApps }: { onClose: () => void; onAllApps: () => void }): ReactNode {
  const [data, setData] = useState<{ here: PhoneAppInfo[]; phone: PhoneAppInfo[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    Promise.all([window.mobMirror.runningApps(), window.mobMirror.listApps()])
      .then(([running, apps]) => {
        if (!live) return
        const byPkg = new Map(apps.map((a) => [a.pkg, a]))
        const info = (pkg: string): PhoneAppInfo => byPkg.get(pkg) ?? { pkg, label: pkg.split('.').pop() ?? pkg, system: false }
        const here = running.here.map(info)
        // On the phone: skip what is already here; only apps the user could open.
        const phone = running.phone.filter((p) => !running.here.includes(p) && byPkg.has(p)).map(info)
        setData({ here, phone })
      })
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      live = false
    }
  }, [])

  const open = (a: PhoneAppInfo): void => {
    onClose()
    window.mobMirror.launchApp(a.pkg).catch((e: unknown) => toast.error(e instanceof Error ? e.message : String(e)))
  }

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-background/95 backdrop-blur-md" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="flex items-center gap-2 px-4 pt-4 pb-2">
        <h2 className="flex-1 text-sm font-semibold">Open apps</h2>
        <Button size="sm" variant="ghost" onClick={onAllApps}>
          <LayoutGrid /> All apps
        </Button>
        <Button size="icon" variant="ghost" aria-label="Close" autoFocus onClick={onClose}>
          <X />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
        {!data && !error && (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Looking at open apps…
          </div>
        )}
        {error && <div className="py-16 text-center text-sm text-muted-foreground">{error}</div>}
        {data && (
          <>
            {data.here.length ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-3">
                {data.here.map((a, i) => (
                  <button
                    key={a.pkg}
                    type="button"
                    onClick={() => open(a)}
                    className="flex flex-col items-center gap-2 rounded-[4px] border bg-card px-3 py-5 transition-colors hover:bg-accent"
                  >
                    <AppIcon app={a} />
                    <span className="line-clamp-1 w-full text-center text-xs font-medium">{a.label}</span>
                    {i === 0 && <span className="text-[10px] text-muted-foreground">On screen</span>}
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-[4px] border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                Nothing open on this screen yet.
                <div className="mt-3">
                  <Button size="sm" variant="outline" onClick={onAllApps}>
                    <LayoutGrid /> Pick an app
                  </Button>
                </div>
              </div>
            )}
            {data.phone.length > 0 && (
              <>
                <h3 className="mt-6 mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Smartphone className="size-3.5" /> Open on the phone, move here
                </h3>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(76px,1fr))] gap-x-2 gap-y-3">
                  {data.phone.map((a) => (
                    <button key={a.pkg} type="button" onClick={() => open(a)} className="flex flex-col items-center gap-1.5 rounded-[4px] p-1.5 hover:bg-accent">
                      <AppIcon app={a} size="size-11" />
                      <span className="line-clamp-2 w-full text-center text-[11px] leading-tight">{a.label}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
