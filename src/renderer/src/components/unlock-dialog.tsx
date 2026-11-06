import { CheckCircle2, KeyRound, Loader2, LockKeyhole, ShieldAlert, XCircle } from 'lucide-react'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import type { UnlockStatusInfo } from '../../../preload/api'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Result = { kind: 'idle' } | { kind: 'busy' } | { kind: 'ok'; text: string } | { kind: 'error'; text: string }

const LABEL: Record<UnlockStatusInfo['credential'], string> = {
  PIN: 'PIN',
  PASSWORD: 'password',
  PATTERN: 'pattern',
  NONE: 'no lock',
  UNKNOWN: 'PIN or password',
}

export function UnlockDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }): ReactNode {
  const [status, setStatus] = useState<UnlockStatusInfo | null>(null)
  const [secret, setSecret] = useState('')
  const [remember, setRemember] = useState(false)
  const [result, setResult] = useState<Result>({ kind: 'idle' })

  useEffect(() => {
    if (!open) return
    setSecret('')
    setRemember(false)
    setResult({ kind: 'idle' })
    setStatus(null)
    window.mobMirror.unlockStatus().then(setStatus, (e: unknown) => setResult({ kind: 'error', text: String(e) }))
  }, [open])

  const run = async (req: { secret?: string; remember?: boolean }): Promise<void> => {
    setResult({ kind: 'busy' })
    try {
      const r = await window.mobMirror.unlock(req)
      setSecret('') // don't keep the secret in UI state longer than needed
      if (r.ok) {
        setResult({ kind: 'ok', text: r.message })
        setTimeout(() => onOpenChange(false), 900)
      } else {
        setResult({ kind: 'error', text: r.message })
        setStatus(await window.mobMirror.unlockStatus())
      }
    } catch (e) {
      setResult({ kind: 'error', text: String(e) })
    }
  }

  const submit = (e: FormEvent): void => {
    e.preventDefault()
    if (secret) void run({ secret, remember })
  }

  const kind = status ? LABEL[status.credential] : 'PIN or password'
  const isPin = status?.credential === 'PIN'
  const busy = result.kind === 'busy'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LockKeyhole className="size-4" /> Unlock phone
          </DialogTitle>
          <DialogDescription>
            Android hides the {kind} screen from screen capture, so it stays black in the mirror. Mob Mirror wakes the
            phone and types your {kind} for you.
          </DialogDescription>
        </DialogHeader>

        {!status && result.kind !== 'error' && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Checking the lock screen…
          </p>
        )}

        {status?.credential === 'PATTERN' ? (
          <Alert variant="destructive">
            <ShieldAlert />
            <AlertDescription>
              This phone uses a pattern, which can’t be typed. Switch it to a PIN or password to unlock from the Mac.
            </AlertDescription>
          </Alert>
        ) : (
          status && (
            <form className="space-y-4" onSubmit={submit}>
              {status.locked === false && (
                <p className="text-sm text-muted-foreground">The phone is currently unlocked.</p>
              )}
              {status.saved ? (
                <div className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
                  <span className="flex items-center gap-2">
                    <KeyRound className="size-4 text-muted-foreground" /> Saved {kind} on this Mac
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => void window.mobMirror.forgetUnlockSecret().then(() => window.mobMirror.unlockStatus().then(setStatus))}
                  >
                    Forget
                  </Button>
                </div>
              ) : (
                status.credential !== 'NONE' && (
                  <>
                    <div className="grid gap-1.5">
                      <Label htmlFor="unlock-secret">{isPin ? 'PIN' : 'PIN or password'}</Label>
                      <Input
                        id="unlock-secret"
                        type="password"
                        autoFocus
                        autoComplete="off"
                        inputMode={isPin ? 'numeric' : 'text'}
                        value={secret}
                        onChange={(e) => setSecret(e.target.value)}
                        disabled={busy}
                      />
                    </div>
                    {status.canSave && (
                      <div className="flex items-start gap-2">
                        <Checkbox id="unlock-remember" checked={remember} onCheckedChange={(v) => setRemember(v === true)} />
                        <Label htmlFor="unlock-remember" className="text-xs leading-snug font-normal text-muted-foreground">
                          Remember on this Mac (encrypted with the macOS Keychain). Anyone using this Mac account could
                          then unlock the phone.
                        </Label>
                      </div>
                    )}
                  </>
                )
              )}

              {result.kind === 'ok' && (
                <Alert>
                  <CheckCircle2 className="text-success" />
                  <AlertDescription>{result.text}</AlertDescription>
                </Alert>
              )}
              {result.kind === 'error' && (
                <Alert variant="destructive">
                  <XCircle />
                  <AlertDescription>{result.text}</AlertDescription>
                </Alert>
              )}

              <DialogFooter className="items-center gap-2 sm:justify-between">
                <p className="text-[11px] text-muted-foreground">Wrong attempts count on the phone. No auto-retry.</p>
                {status.saved || status.credential === 'NONE' ? (
                  <Button type="button" disabled={busy} onClick={() => void run({})}>
                    {busy && <Loader2 className="animate-spin" />} Unlock
                  </Button>
                ) : (
                  <Button type="submit" disabled={busy || !secret}>
                    {busy && <Loader2 className="animate-spin" />} Unlock
                  </Button>
                )}
              </DialogFooter>
            </form>
          )
        )}
      </DialogContent>
    </Dialog>
  )
}
