import { CheckCircle2, Fingerprint, KeyRound, Loader2, LockKeyhole, ShieldAlert, XCircle } from 'lucide-react'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import type { UnlockStatusInfo } from '../../../preload/api'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Result = { kind: 'idle' } | { kind: 'busy' } | { kind: 'ok'; text: string } | { kind: 'error'; text: string }

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

  const isPin = status?.credential === 'PIN'
  const busy = result.kind === 'busy'
  /** Saved secret usable now (with Touch ID only when the user asked for it). */
  const canUseSaved = !!status?.saved && (!requireTouchId || status.touchId)
  const touch = requireTouchId && canUseSaved

  // Friendly name for the app asking (com.whatsapp -> WhatsApp); null when none is recognised.
  const app = screenMode && status?.credentialPrompt ? appName(status.promptOwner ?? status.foreground?.package ?? null) : null
  const title = !status ? 'Unlock' : screenMode ? (app ? `Unlock ${app}` : 'Enter PIN') : 'Unlock phone'
  const word = isPin ? 'PIN' : 'password'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-5 sm:max-w-[340px]">
        <DialogHeader className="items-center text-center">
          <div className="mb-1 grid size-11 place-items-center rounded-full bg-muted">
            <LockKeyhole className="size-5" />
          </div>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>We’ll type it on your phone for you.</DialogDescription>
        </DialogHeader>

        {!status && result.kind !== 'error' && (
          <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Checking the phone…
          </p>
        )}

        {status?.credential === 'PATTERN' ? (
          <Alert variant="destructive">
            <ShieldAlert />
            <AlertDescription>Pattern locks can’t be typed. Switch the phone to a PIN or password to unlock from the Mac.</AlertDescription>
          </Alert>
        ) : (
          status && (
            <form className="flex flex-col gap-3" onSubmit={submit}>
              {status.credential !== 'NONE' && (
                <Input
                  id="unlock-secret"
                  aria-label={word}
                  type="password"
                  autoFocus
                  autoComplete="off"
                  inputMode={isPin ? 'numeric' : 'text'}
                  placeholder={isPin ? '••••' : 'Password'}
                  className="h-11 text-center text-lg tracking-[0.4em] placeholder:tracking-[0.4em]"
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  disabled={busy}
                />
              )}

              {result.kind === 'ok' && (
                <p className="flex items-center justify-center gap-1.5 text-sm text-success">
                  <CheckCircle2 className="size-4" /> {result.text}
                </p>
              )}
              {result.kind === 'error' && (
                <p className="flex items-start justify-center gap-1.5 text-center text-xs text-destructive">
                  <XCircle className="mt-px size-3.5 shrink-0" /> {result.text}
                </p>
              )}

              {status.credential === 'NONE' ? (
                <Button type="button" className="h-10" disabled={busy} onClick={() => void run({ target })}>
                  {busy && <Loader2 className="animate-spin" />} Unlock
                </Button>
              ) : (
                <Button type="submit" className="h-10" disabled={busy || !secret}>
                  {busy && secret && <Loader2 className="animate-spin" />} Unlock
                </Button>
              )}

              {canUseSaved && (
                <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" disabled={busy} onClick={() => void run({ target })}>
                  {busy && !secret ? <Loader2 className="animate-spin" /> : touch ? <Fingerprint /> : <KeyRound />}
                  Use saved {word}
                </Button>
              )}

              {/* Only the phone's own lock PIN can be saved: an app-lock PIN saved as the phone PIN
                  would later waste the phone's limited attempts. */}
              {status.canSave && !status.saved && !screenMode && status.credential !== 'NONE' && (
                <div className="flex items-center justify-center gap-2">
                  <Checkbox id="unlock-remember" checked={remember} onCheckedChange={(v) => setRemember(v === true)} />
                  <Label htmlFor="unlock-remember" className="text-xs font-normal text-muted-foreground">
                    Remember on this Mac
                  </Label>
                </div>
              )}
              {screenMode && !app && (
                <p className="text-center text-[11px] text-muted-foreground">Open the PIN screen on the phone first.</p>
              )}
            </form>
          )
        )}
      </DialogContent>
    </Dialog>
  )
}

/** com.whatsapp -> WhatsApp, com.nothing.applocker -> App lock, else the last name segment. */
function appName(pkg: string | null): string | null {
  if (!pkg) return null
  const known: Record<string, string> = {
    'com.whatsapp': 'WhatsApp',
    'com.whatsapp.w4b': 'WhatsApp Business',
    'com.nothing.applocker': 'app',
    'org.telegram.messenger': 'Telegram',
    'com.instagram.android': 'Instagram',
    'com.google.android.apps.nbu.paisa.user': 'GPay',
    'com.phonepe.app': 'PhonePe',
  }
  if (known[pkg]) return known[pkg]!
  const last = pkg.split('.').pop() ?? pkg
  return last.charAt(0).toUpperCase() + last.slice(1)
}
