import { Copy, Download, Loader2, RefreshCw, Search, Smartphone } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

type Details = Awaited<ReturnType<typeof window.mobMirror.phoneDetails>>
/** The phone app version that first sends details (InfoReceiver). */
const DETAILS_APP_VERSION = [0, 3, 0]

const older = (v: string | null): boolean => {
  if (!v) return true
  const a = v.split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== DETAILS_APP_VERSION[i]) return (a[i] ?? 0) < DETAILS_APP_VERSION[i]!
  return false
}

/**
 * Everything about a phone: model, Android and API level, CPU, memory, display, battery, cameras,
 * sensors, codecs… From the Twinglass phone app when installed (the same list it shows on the
 * phone), else from adb (system properties only).
 */
export function PhoneDetailsDialog({ request }: { request: { serial: string; name: string; n: number } }): ReactNode {
  const [target, setTarget] = useState<{ serial: string; name: string } | null>(null)
  const [data, setData] = useState<Details | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [q, setQ] = useState('')

  const load = useCallback((serial: string) => {
    setBusy(true)
    setError(null)
    window.mobMirror
      .phoneDetails(serial)
      .then(setData, (e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(false))
  }, [])

  // Each request (n changes) opens the window for that phone. The app listens for the event and
  // loads this dialog lazily on the first one.
  useEffect(() => {
    setTarget({ serial: request.serial, name: request.name })
    setData(null)
    setQ('')
    load(request.serial)
  }, [request.n, request.serial, request.name, load])

  const sections = useMemo(() => {
    const all = data?.sections ?? []
    const needle = q.trim().toLowerCase()
    if (!needle) return all
    return all
      .map((s) => (s.title.toLowerCase().includes(needle) ? s : { ...s, rows: s.rows.filter((r) => `${r.label} ${r.value}`.toLowerCase().includes(needle)) }))
      .filter((s) => s.rows.length)
  }, [data, q])

  const copy = (text: string, what: string): void => {
    void navigator.clipboard.writeText(text).then(() => toast.success(`Copied ${what}`))
  }
  const allText = (): string => (data?.sections ?? []).map((s) => `${s.title}\n${s.rows.map((r) => `${r.label}: ${r.value}`).join('\n')}`).join('\n\n')

  const install = (): void => {
    if (!target) return
    const id = toast.loading('Installing the Twinglass phone app…')
    window.mobMirror.companionInstall(target.serial).then(
      () => {
        toast.success('Phone app installed', { id })
        load(target.serial)
      },
      (e: unknown) => toast.error(e instanceof Error ? e.message : String(e), { id }),
    )
  }

  const sub = data?.sections.find((s) => s.title === 'Android')?.rows
  const api = sub?.find((r) => r.label === 'API level')?.value
  const version = sub?.find((r) => r.label === 'Version')?.value

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-5 pt-5 pb-4">
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="size-4" /> {target?.name ?? 'Phone'}
            {data && (
              <Badge variant="secondary" className="ml-1 font-normal">
                {data.source === 'phone-app' ? `From Twinglass phone app ${data.appVersion ?? ''}` : 'From adb'}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>{[version, api && `API ${api}`].filter(Boolean).join(' · ') || 'Everything about this phone'}</DialogDescription>
          <div className="mt-3 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter (e.g. battery, hdr, codec)" className="pl-8" />
            </div>
            <Button size="icon" variant="ghost" aria-label="Refresh" disabled={busy || !target} onClick={() => target && load(target.serial)}>
              <RefreshCw className={busy ? 'animate-spin' : ''} />
            </Button>
            <Button size="sm" variant="outline" disabled={!data} onClick={() => copy(allText(), 'all details')}>
              <Copy /> Copy all
            </Button>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {data && (data.source === 'adb' || older(data.appVersion)) && (
            <div className="mb-4 flex items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <span className="flex-1">
                {data.appVersion
                  ? `The phone app ${data.appVersion} is older: update it to also see cameras, sensors, codecs and more.`
                  : 'Install the small Twinglass phone app to also see cameras, sensors, codecs and more.'}
              </span>
              <Button size="sm" variant="outline" onClick={install}>
                <Download /> {data.appVersion ? 'Update' : 'Install'}
              </Button>
            </div>
          )}
          {!data && !error && (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Reading the phone…
            </div>
          )}
          {error && <div className="py-16 text-center text-sm text-muted-foreground">{error}</div>}
          <div className="columns-1 gap-4 sm:columns-2">
            {sections.map((s) => (
              <section key={s.title} className="mb-4 break-inside-avoid rounded-xl border bg-card">
                <h3 className="label-mono border-b px-3 py-2 text-faint">{s.title}</h3>
                <dl className="divide-y">
                  {s.rows.map((r) => (
                    <button
                      key={r.label}
                      type="button"
                      title="Click to copy"
                      onClick={() => copy(`${r.label}: ${r.value}`, r.label)}
                      className="flex w-full items-baseline gap-3 px-3 py-1.5 text-left text-[13px] hover:bg-accent"
                    >
                      <dt className="w-28 shrink-0 text-muted-foreground">{r.label}</dt>
                      <dd className="min-w-0 flex-1 break-words">{r.value}</dd>
                    </button>
                  ))}
                </dl>
              </section>
            ))}
          </div>
          {data && !sections.length && <div className="py-10 text-center text-sm text-muted-foreground">Nothing matches “{q}”.</div>}
        </div>
      </DialogContent>
    </Dialog>
  )
}
