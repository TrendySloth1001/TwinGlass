import { CheckCircle2, Fingerprint, KeyRound, Loader2, LockKeyhole, ShieldAlert, XCircle } from 'lucide-react'
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

export function UnlockDialog({
  open,
  onOpenChange,
  initialError,
  requireTouchId,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  /** Why a direct unlock failed (shown when the dialog opens as the fallback). */
  initialError?: string | null
  /** Settings → Unlock → Ask for Touch ID first. */
  requireTouchId: boolean
}): ReactNode {
  const [status, setStatus] = useState<UnlockStatusInfo | null>(null)
  const [secret, setSecret] = useState('')
  const [remember, setRemember] = useState(false)
  const [result, setResult] = useState<Result>({ kind: 'idle' })

  useEffect(() => {
    if (!open) return
    setSecret('')
    setRemember(false)
    setResult(initialError ? { kind: 'error', text: initialError } : { kind: 'idle' })
    setStatus(null)
    window.mobMirror.unlockStatus().then(setStatus, (e: unknown) => setResult({ kind: 'error', text: String(e) }))
  }, [open, initialError])

  const run = async (req: { secret?: string; remember?: boolean; target?: 'auto' | 'screen' }): Promise<void> => {
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

  /** Phone already unlocked: the PIN goes into the current screen (app lock), explicitly confirmed. */
  const screenMode = status?.locked === false
  const target = screenMode ? ('screen' as const) : ('auto' as const)

  const submit = (e: FormEvent): void => {
    e.preventDefault()
    if (secret) void run({ secret, remember, target })
  }

  const kind = status ? LABEL[status.credential] : 'PIN or password'
  const isPin = status?.credential === 'PIN'
  const busy = result.kind === 'busy'
  /** Saved secret usable now (with Touch ID only when the user asked for it). */
  const canUseSaved = !!status?.saved && (!requireTouchId || status.touchId)
  const touch = requireTouchId && canUseSaved

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
              {screenMode && status.credentialPrompt && (
                <p className="text-sm text-muted-foreground">
                  <b className="text-foreground">{status.promptOwner ?? status.foreground?.package}</b> is asking for your {kind}.
                </p>
              )}
              {screenMode && !status.credentialPrompt && (
                <Alert>
                  <ShieldAlert />
                  <AlertDescription className="text-xs">
                    The phone is unlocked. If <b className="text-foreground">{status.foreground?.package ?? 'an app'}</b> is
                    showing its own PIN prompt (app lock), Mob Mirror can type your {kind} into it. Only do this on a PIN
                    screen: it types into whatever field has focus.
                  </AlertDescription>
                </Alert>
              )}
              {canUseSaved && (
                <div className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    {touch ? <Fingerprint className="size-4 shrink-0 text-brand" /> : <KeyRound className="size-4 shrink-0 text-muted-foreground" />}
                    <span className="truncate">Saved {kind}{touch ? ' · Touch ID' : ''}</span>
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => void window.mobMirror.forgetUnlockSecret().then(() => window.mobMirror.unlockStatus().then(setStatus))}
                    >
                      Forget
                    </Button>
                    <Button type="button" size="sm" disabled={busy} onClick={() => void run({ target })}>
                      {busy && !secret ? <Loader2 className="animate-spin" /> : touch && <Fingerprint />}
                      {screenMode ? 'Type it' : 'Unlock'}
                    </Button>
                  </div>
                </div>
              )}
              {status.credential !== 'NONE' && (
                <>
                  <div className="grid gap-1.5">
                    <Label htmlFor="unlock-secret">
                      {canUseSaved ? `Or type a ${isPin ? 'PIN' : 'PIN or password'}` : isPin ? 'PIN' : 'PIN or password'}
                    </Label>
                    <Input
                      id="unlock-secret"
                      type="password"
                      autoFocus
                      autoComplete="off"
                      inputMode={isPin ? 'numeric' : 'text'}
                      placeholder={screenMode ? 'The PIN this app asks for' : undefined}
                      value={secret}
                      onChange={(e) => setSecret(e.target.value)}
                      disabled={busy}
                    />
                    {screenMode && (
                      <p className="text-[11px] text-muted-foreground">
                        Some app locks use their own PIN instead of the phone’s: type that one here.
                      </p>
                    )}
                  </div>
                  {/* Only the phone's own lock PIN can be saved: an app-lock PIN saved as the phone PIN
                      would later waste the phone's limited attempts. */}
                  {status.canSave && !status.saved && !screenMode && (
                    <div className="flex items-start gap-2">
                      <Checkbox id="unlock-remember" checked={remember} onCheckedChange={(v) => setRemember(v === true)} />
                      <Label htmlFor="unlock-remember" className="text-xs leading-snug font-normal text-muted-foreground">
                        Remember on this Mac (encrypted in the macOS Keychain). Next time ⌘L types it for you.
                      </Label>
                    </div>
                  )}
                </>
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
                {status.credential === 'NONE' ? (
                  <Button type="button" disabled={busy} onClick={() => void run({ target })}>
                    {busy && <Loader2 className="animate-spin" />} Unlock
                  </Button>
                ) : (
                  <Button type="submit" variant={canUseSaved ? 'outline' : 'default'} disabled={busy || !secret}>
                    {busy && secret && <Loader2 className="animate-spin" />} {screenMode ? `Type this ${kind}` : 'Unlock with this PIN'}
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
