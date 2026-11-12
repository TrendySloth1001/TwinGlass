import { Cable, Check, Loader2, Smartphone, Wifi } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import type { DirectPhoneInfo } from '../../../preload/api'
import { Button } from '@/components/ui/button'
import { BottomSheet, BottomSheetContent, BottomSheetDescription, BottomSheetTitle } from '@/components/ui/bottom-sheet'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'

type Path = 'wifi' | 'developer'

/** Numbered step with a title and body (the sheet's columns). */
function Step({ n, title, children, done }: { n: number; title: string; children: ReactNode; done?: boolean }): ReactNode {
  return (
    <div className="flex min-w-0 flex-1 flex-col rounded-[4px] border bg-background/60 p-5">
      <div className="mb-3 flex items-center gap-2.5">
        <span className={cn('grid size-6 place-items-center rounded-full text-[11px] font-semibold', done ? 'bg-brand text-white' : 'bg-primary text-primary-foreground')}>
          {done ? <Check className="size-3.5" /> : n}
        </span>
        <span className="text-[15px] font-semibold">{title}</span>
      </div>
      {children}
    </div>
  )
}

/**
 * "Add a phone": the no-setup Wi-Fi path first (get the app by QR from this Mac, pair with a
 * code), Developer mode as the alternative. Closes itself with a confirmation once paired.
 */
export function AddPhoneSheet({ open, onOpenChange, onDeveloper }: { open: boolean; onOpenChange: (o: boolean) => void; onDeveloper: () => void }): ReactNode {
  const [path, setPath] = useState<Path>('wifi')
  const [apk, setApk] = useState<{ url: string; qr: string } | null>(null)
  const [code, setCode] = useState<{ code: string; until: number } | null>(null)
  const [now, setNow] = useState(Date.now())
  const [paired, setPaired] = useState<DirectPhoneInfo | null>(null)

  // While open on the Wi-Fi path: serve the app, show a fresh code, watch for the phone.
  useEffect(() => {
    if (!open || path !== 'wifi') return
    let known = new Set<string>()
    setPaired(null)
    void window.mobMirror.directList().then((l) => (known = new Set(l.map((p) => p.id))))
    // Code first: the QR carries it (scan in Twinglass = paired, no typing).
    void window.mobMirror.directPairing(true).then((c) => {
      setCode(c)
      void window.mobMirror.directApk(true).then(setApk)
    })
    const off = window.mobMirror.onDirectChanged((list) => {
      const fresh = list.find((p) => !known.has(p.id))
      if (fresh) setPaired(fresh)
    })
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => {
      off()
      clearInterval(t)
      void window.mobMirror.directApk(false)
      void window.mobMirror.directPairing(false)
    }
  }, [open, path])

  const left = code ? Math.max(0, Math.round((code.until - now) / 1000)) : 0
  const expired = !!code && left === 0
  const newCode = (): void =>
    void window.mobMirror.directPairing(true).then((c) => {
      setCode(c)
      void window.mobMirror.directApk(true).then(setApk)
    })

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent>
        <div className="overflow-y-auto px-8 pt-5 pb-8">
          <BottomSheetTitle className="text-2xl font-bold tracking-tight">Add a phone</BottomSheetTitle>
          <BottomSheetDescription className="mt-1 text-[13px] text-muted-foreground">Android 10 or newer. Pick how it connects; you can add the other way later.</BottomSheetDescription>

          <ToggleGroup type="single" spacing={0} value={path} onValueChange={(v) => v && setPath(v as Path)} className="mt-5">
            <ToggleGroupItem value="wifi" className="px-4">
              <Wifi /> Wi-Fi, no setup
            </ToggleGroupItem>
            <ToggleGroupItem value="developer" className="px-4">
              <Cable /> Developer mode
            </ToggleGroupItem>
          </ToggleGroup>

          {path === 'wifi' &&
            (paired ? (
              <div className="mt-6 flex items-center gap-4 rounded-[4px] border bg-background/60 p-6">
                <span className="grid size-12 place-items-center rounded-full bg-brand text-white">
                  <Check className="size-6" />
                </span>
                <div className="flex-1">
                  <div className="text-lg font-semibold">{paired.name} is paired</div>
                  <div className="text-[13px] text-muted-foreground">Tap “Mirror to Mac” on the phone. A window opens here by itself.</div>
                </div>
                <Button onClick={() => onOpenChange(false)}>Done</Button>
              </div>
            ) : (
              <div className="mt-6 flex flex-wrap gap-4">
                <Step n={1} title="Scan this QR">
                  <p className="mb-4 text-[13px] text-muted-foreground">
                    <b className="text-foreground">No app yet?</b> Scan with the phone’s camera to download Twinglass from this Mac.{' '}
                    <b className="text-foreground">Have it?</b> Tap “Scan QR code” in Twinglass: it pairs right away.
                  </p>
                  <div className="flex items-center gap-4">
                    {apk ? (
                      <img src={apk.qr} alt="QR code to download the Twinglass app" className="size-36 rounded-[4px] bg-white p-1.5" draggable={false} />
                    ) : (
                      <div className="grid size-36 place-items-center rounded-[4px] border border-dashed text-center text-[11px] text-muted-foreground">Not on Wi-Fi</div>
                    )}
                    <div className="min-w-0 text-[12px] text-muted-foreground">
                      The QR changes with each code.
                      {apk && <div className="mt-2 font-mono text-[10.5px] break-all text-faint">{apk.url}</div>}
                    </div>
                  </div>
                </Step>
                <Step n={2} title="Or type this code">
                  <p className="mb-4 text-[13px] text-muted-foreground">No camera handy? In Twinglass: Pair with your Mac → pick this Mac → enter:</p>
                  <div className={cn('text-center font-bold tracking-[0.3em] tabular-nums', expired ? 'text-muted-foreground line-through' : 'text-foreground')} style={{ fontSize: 44, lineHeight: 1.1 }}>
                    {code ? `${code.code.slice(0, 3)} ${code.code.slice(3)}` : '··· ···'}
                  </div>
                  <div className="mt-3 flex items-center justify-center gap-2 text-[12px] text-muted-foreground">
                    {expired ? (
                      <Button size="sm" variant="outline" onClick={newCode}>
                        New code
                      </Button>
                    ) : (
                      <>
                        <Loader2 className="size-3.5 animate-spin" /> Waiting for your phone · {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
                      </>
                    )}
                  </div>
                </Step>
              </div>
            ))}

          {path === 'developer' && (
            <div className="mt-6 flex flex-wrap gap-4">
              <Step n={1} title="Turn on USB debugging">
                <p className="text-[13px] text-muted-foreground">
                  On the phone: Settings → About phone → tap <b className="text-foreground">Build number</b> 7 times. Then Settings → System → Developer options → turn on{' '}
                  <b className="text-foreground">USB debugging</b>.
                </p>
              </Step>
              <Step n={2} title="Connect">
                <p className="mb-4 text-[13px] text-muted-foreground">Plug it in with a cable and tap “Allow” on the phone. Or pair over Wi-Fi with wireless debugging.</p>
                <Button variant="outline" onClick={onDeveloper}>
                  <Smartphone /> Pair over wireless debugging
                </Button>
              </Step>
            </div>
          )}
        </div>
      </BottomSheetContent>
    </BottomSheet>
  )
}
