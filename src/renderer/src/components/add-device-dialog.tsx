import { CheckCircle2, Loader2, QrCode, KeyRound, Network, XCircle } from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import type { OpResult, QrState } from '../../../preload/api'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

type Status = { kind: 'idle' } | { kind: 'busy'; text: string } | { kind: 'ok'; text: string } | { kind: 'error'; text: string }

function StatusLine({ status }: { status: Status }): ReactNode {
  if (status.kind === 'idle') return null
  if (status.kind === 'busy') {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> {status.text}
      </p>
    )
  }
  return (
    <Alert variant={status.kind === 'error' ? 'destructive' : 'default'}>
      {status.kind === 'ok' ? <CheckCircle2 className="text-success" /> : <XCircle />}
      <AlertDescription className="break-words">{status.text}</AlertDescription>
    </Alert>
  )
}

function Steps({ children }: { children: ReactNode }): ReactNode {
  return <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground [&_b]:text-foreground">{children}</ol>
}

function QrPanel({ active, onPaired }: { active: boolean; onPaired: () => void }): ReactNode {
  const [svg, setSvg] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  useEffect(() => {
    if (!active) return
    let cancelled = false
    const off = window.mobMirror.onQrState((s: QrState) => {
      if (s.state === 'waiting') setStatus({ kind: 'busy', text: 'Waiting for the phone to scan the code…' })
      else if (s.state === 'pairing') setStatus({ kind: 'busy', text: `Found the phone at ${s.hostPort}. Pairing…` })
      else if (s.state === 'paired') {
        setStatus({ kind: 'ok', text: 'Paired. The phone will appear in the device list in a moment.' })
        setTimeout(onPaired, 2000)
      } else setStatus({ kind: 'error', text: s.message })
    })
    window.mobMirror.startQrPairing().then(
      (r) => !cancelled && setSvg(r.svg),
      (e: unknown) => setStatus({ kind: 'error', text: String(e) }),
    )
    return () => {
      cancelled = true
      off()
      void window.mobMirror.cancelQrPairing()
      setSvg(null)
      setStatus({ kind: 'idle' })
    }
  }, [active, onPaired])

  return (
    <div className="space-y-4">
      <Steps>
        <li>
          Connect the phone to the <b>same Wi-Fi</b> as this Mac.
        </li>
        <li>
          On the phone: <b>Settings → Developer options → Wireless debugging</b>.
        </li>
        <li>
          Tap <b>Pair device with QR code</b> and scan:
        </li>
      </Steps>
      <div className="grid min-h-56 place-items-center">
        {svg ? (
          // The SVG is generated locally by the main process (qrcode library), never fetched.
          <div className="size-56 rounded-lg bg-white p-2 [&_svg]:size-full" dangerouslySetInnerHTML={{ __html: svg }} />
        ) : (
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        )}
      </div>
      <StatusLine status={status} />
    </div>
  )
}

function useOp(): [Status, (op: () => Promise<OpResult>, okText: string) => Promise<boolean>] {
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const exec = async (op: () => Promise<OpResult>, okText: string): Promise<boolean> => {
    setStatus({ kind: 'busy', text: 'Working…' })
    try {
      const r = await op()
      setStatus(r.ok ? { kind: 'ok', text: okText } : { kind: 'error', text: r.message || 'Failed.' })
      return r.ok
    } catch (e) {
      setStatus({ kind: 'error', text: String(e) })
      return false
    }
  }
  return [status, exec]
}

function CodePanel(): ReactNode {
  const [status, exec] = useOp()
  const submit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault()
    const form = e.currentTarget
    const d = new FormData(form)
    void exec(
      () => window.mobMirror.pair(String(d.get('hostPort')), String(d.get('code'))),
      'Paired. The phone should connect on its own. If it does not appear, use "Address".',
    ).then((ok) => ok && form.reset())
  }
  return (
    <form className="space-y-4" onSubmit={submit}>
      <Steps>
        <li>
          On the phone: <b>Wireless debugging → Pair device with pairing code</b>.
        </li>
        <li>
          Enter the <b>IP address &amp; port</b> and the <b>6-digit code</b> it shows.
        </li>
      </Steps>
      <div className="grid grid-cols-[1fr_8rem] gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="pair-host">IP address &amp; port</Label>
          <Input id="pair-host" name="hostPort" placeholder="192.168.0.13:37851" required autoComplete="off" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="pair-code">Code</Label>
          <Input id="pair-code" name="code" placeholder="123456" inputMode="numeric" maxLength={6} required />
        </div>
      </div>
      <Button type="submit" className="w-full" disabled={status.kind === 'busy'}>
        Pair
      </Button>
      <StatusLine status={status} />
    </form>
  )
}

function AddressPanel(): ReactNode {
  const [status, exec] = useOp()
  const submit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault()
    const form = e.currentTarget
    const hostPort = String(new FormData(form).get('hostPort'))
    void exec(() => window.mobMirror.connect(hostPort), 'Connected.').then((ok) => ok && form.reset())
  }
  return (
    <form className="space-y-4" onSubmit={submit}>
      <p className="text-sm text-muted-foreground">
        For a phone that is already paired, use the <b className="text-foreground">IP address &amp; port</b> on its
        Wireless debugging screen (not the pairing port). Phones set up with <code>adb tcpip</code> use port 5555.
      </p>
      <div className="grid gap-1.5">
        <Label htmlFor="connect-host">IP address &amp; port</Label>
        <Input id="connect-host" name="hostPort" placeholder="192.168.0.13:41233" required autoComplete="off" />
      </div>
      <Button type="submit" className="w-full" disabled={status.kind === 'busy'}>
        Connect
      </Button>
      <StatusLine status={status} />
      <p className="text-xs text-muted-foreground">
        <b className="text-foreground">Android 10 or older?</b> Plug the phone in by USB, open its ⋮ menu in the device
        list and choose <b className="text-foreground">Switch to Wi-Fi</b> (older, unencrypted mode).
      </p>
    </form>
  )
}

export function AddDeviceDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }): ReactNode {
  const [tab, setTab] = useState('qr')
  // Stable identity: QrPanel's effect depends on it and would restart pairing on every render otherwise.
  const close = useCallback(() => onOpenChange(false), [onOpenChange])
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a wireless device</DialogTitle>
          <DialogDescription>Android 11 or newer. Pairing is needed only once per phone.</DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full">
            <TabsTrigger value="qr">
              <QrCode /> QR code
            </TabsTrigger>
            <TabsTrigger value="code">
              <KeyRound /> Pairing code
            </TabsTrigger>
            <TabsTrigger value="address">
              <Network /> Address
            </TabsTrigger>
          </TabsList>
          <TabsContent value="qr" className="pt-2">
            <QrPanel active={open && tab === 'qr'} onPaired={close} />
          </TabsContent>
          <TabsContent value="code" className="pt-2">
            <CodePanel />
          </TabsContent>
          <TabsContent value="address" className="pt-2">
            <AddressPanel />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
