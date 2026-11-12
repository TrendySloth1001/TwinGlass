import { EllipsisVertical, Loader2, Play, Trash2, Wifi } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import type { DirectPhoneInfo, TransportInfo } from '../../../preload/api'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'

/** Paired "Wi-Fi, no setup" phones (live). */
export function useDirectPhones(): DirectPhoneInfo[] {
  const [list, setList] = useState<DirectPhoneInfo[]>([])
  useEffect(() => {
    void window.mobMirror.directList().then(setList)
    return window.mobMirror.onDirectChanged(setList)
  }, [])
  return list
}

/** What a no-setup phone is doing, in words, and its dot. */
function state(p: DirectPhoneInfo): { text: string; dot: string } {
  if (p.mirroring) return { text: 'Mirroring', dot: 'bg-brand animate-pulse' }
  if (p.offering) return { text: 'Sharing its screen: open it', dot: 'bg-brand' }
  if (p.online) return { text: 'Ready: tap “Mirror to Mac” on the phone', dot: 'bg-success' }
  return { text: 'Offline: open Twinglass on the phone', dot: 'bg-muted-foreground/50' }
}

/** Rows for the home screen's "Your phone" section. */
export function DirectPhones({ phones, onMirror, connecting }: { phones: DirectPhoneInfo[]; onMirror: (t: TransportInfo, id: string) => void; connecting: boolean }): ReactNode {
  const [confirm, setConfirm] = useState<DirectPhoneInfo | null>(null)
  const forget = (p: DirectPhoneInfo): void => {
    setConfirm(null)
    void window.mobMirror.directForget(p.id).then((r) =>
      toast.success(`Forgot ${p.name}`, {
        description: r.told ? 'Removed on this Mac and on the phone.' : 'Removed here. The phone forgets this Mac the next time Twinglass opens on it.',
      }),
    )
  }
  return (
    <>
      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Forget {confirm?.name}?</AlertDialogTitle>
            <AlertDialogDescription>It’s removed on this Mac and on the phone. To use it again, pair it with a new code.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-brand text-white hover:bg-brand/90" onClick={() => confirm && forget(confirm)}>
              Forget
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {phones.map((p) => {
        const s = state(p)
        const t: TransportInfo = { serial: `direct:${p.id}`, kind: 'wifi', state: 'device', model: p.model }
        return (
          <div key={p.id} className="flex items-center gap-4 rounded-[4px] border bg-card px-5 py-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted">
              <Wifi className="size-4.5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-[15px] font-semibold">{p.name}</span>
                <span className="label-mono rounded-full border border-border-strong px-2 py-0.5 text-[9.5px] text-muted-foreground">No setup</span>
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
                <span className={cn('size-1.5 rounded-full', s.dot)} /> {s.text}
              </div>
            </div>
            <Button disabled={!p.offering || connecting} onClick={() => onMirror(t, p.id)} title={p.offering ? 'Open the mirror' : 'Tap “Mirror to Mac” on the phone first'}>
              {connecting && p.offering ? <Loader2 className="animate-spin" /> : <Play />} Mirror
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon-sm" variant="ghost" aria-label="More">
                  <EllipsisVertical />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem variant="destructive" onSelect={() => setConfirm(p)}>
                  <Trash2 /> Forget this phone
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )
      })}
    </>
  )
}
