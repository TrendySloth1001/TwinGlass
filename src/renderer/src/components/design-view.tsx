// Design check: paste a Figma frame link, compare it with the phone's screen, list what's off.
import { ExternalLink, Frame, KeyRound, Loader2, Ruler } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import type { DesignCompareResult } from '../../../main/design-ipc'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

const KIND_LABEL: Record<string, string> = {
  missing: 'Missing on screen',
  position: 'Position',
  size: 'Width',
  font: 'Font size',
  color: 'Colour',
  extra: 'Not in the design',
}

export function DesignView({ target }: { target: { serial: string; name: string } | null }): ReactNode {
  const [token, setToken] = useState<boolean | null>(null)
  const [draft, setDraft] = useState('')
  const [url, setUrl] = useState(() => {
    try {
      return localStorage.getItem('mob-mirror:figma-url') ?? ''
    } catch {
      return ''
    }
  })
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<DesignCompareResult | null>(null)
  const [images, setImages] = useState(false)
  useEffect(() => void window.mobMirror.design.tokenStatus().then((s) => setToken(s.saved), () => setToken(false)), [])

  const saveToken = async (): Promise<void> => {
    try {
      const r = await window.mobMirror.design.setToken(draft)
      setToken(true)
      setDraft('')
      toast.success('Figma connected', { description: r.handle ? `Signed in as ${r.handle}. The token is kept encrypted on this Mac.` : undefined })
    } catch (e) {
      toast.error('Couldn’t use that token', { description: e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e) })
    }
  }
  const compare = async (): Promise<void> => {
    if (!target) return void toast.error('Connect a phone first.')
    setBusy(true)
    try {
      localStorage.setItem('mob-mirror:figma-url', url)
    } catch {
      /* private storage: fine */
    }
    try {
      setResult(await window.mobMirror.design.compare(url, target.serial))
    } catch (e) {
      toast.error('Couldn’t compare', { description: e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e) })
    } finally {
      setBusy(false)
    }
  }

  if (token === false)
    return (
      <div className="flex flex-col gap-2.5 px-3 pt-1 pb-3 text-[12px]">
        <p className="leading-snug text-muted-foreground">
          Compare a Figma frame with the phone’s screen: missing or extra texts, and positions, widths, font sizes and colours that are off.
        </p>
        <p className="leading-snug text-muted-foreground">
          Add a Figma personal access token (read-only file access is enough). It’s kept encrypted on this Mac and only sent to Figma.
        </p>
        <button type="button" onClick={() => void window.mobMirror.openAboutLink('figma-tokens')} className="inline-flex items-center gap-1 self-start text-link hover:underline">
          How to create one <ExternalLink className="size-3" />
        </button>
        <form
          className="flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault()
            void saveToken()
          }}
        >
          <Input type="password" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="figd_…" className="text-[12px]" />
          <Button type="submit" size="sm" disabled={!draft.trim()}>
            <KeyRound /> Save
          </Button>
        </form>
      </div>
    )

  const r = result?.report
  return (
    <div className="flex flex-col gap-2.5 px-3 pt-1 pb-3 text-[12px]">
      <form
        className="flex flex-col gap-1.5"
        onSubmit={(e) => {
          e.preventDefault()
          void compare()
        }}
      >
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Figma frame link (Copy link to selection)" className="text-[12px]" />
        <Button type="submit" size="sm" disabled={!url.trim() || busy || !target}>
          {busy ? <Loader2 className="animate-spin" /> : <Ruler />} {target ? `Compare with ${target.name}` : 'Connect a phone first'}
        </Button>
      </form>
      {r && (
        <>
          <div className="flex items-center gap-2 border-t border-border pt-2">
            <Frame className="size-4 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate font-medium">{r.frame}</span>
            {(result.designImage || result.screenImage) && (
              <Button size="xs" variant="secondary" onClick={() => setImages(true)}>
                Side by side
              </Button>
            )}
          </div>
          <p className="text-muted-foreground">
            {r.matched} texts matched · {r.issues.length ? `${r.issues.length} to look at` : 'everything matches'}
            {(r.offset.dx || r.offset.dy) ? ` · content offset ${r.offset.dx}, ${r.offset.dy} dp (ignored)` : ''}
          </p>
          <ul className="flex flex-col gap-1">
            {r.issues.map((i, k) => (
              <li key={k} className="rounded-[4px] border border-border px-2 py-1.5">
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      'shrink-0 rounded-[3px] px-1 text-[10px] font-semibold uppercase',
                      i.kind === 'missing' || i.kind === 'position' ? 'bg-destructive/15 text-destructive' : i.kind === 'extra' ? 'bg-foreground/10 text-muted-foreground' : 'bg-warning/15 text-warning',
                    )}
                  >
                    {KIND_LABEL[i.kind] ?? i.kind}
                  </span>
                  <span className="truncate">“{i.text}”</span>
                </div>
                {(i.design || i.screen) && (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {i.design && <>Design {i.design}</>}
                    {i.design && i.screen && ' · '}
                    {i.screen && <>Screen {i.screen}</>}
                    {i.delta !== undefined && ` (${i.delta > 0 ? '+' : ''}${i.delta})`}
                  </p>
                )}
              </li>
            ))}
          </ul>
          <Dialog open={images} onOpenChange={setImages}>
            <DialogContent className="max-h-[calc(100vh-48px)] w-auto max-w-[calc(100vw-48px)] overflow-auto sm:max-w-none">
              <DialogTitle>{r.frame}: design and screen</DialogTitle>
              <DialogDescription className="sr-only">The Figma frame next to the phone’s screen</DialogDescription>
              <div className="flex gap-4">
                {result.designImage && (
                  <figure className="flex flex-col gap-1.5">
                    <img src={result.designImage} alt="The Figma frame" className="max-h-[70vh] rounded-[4px] border border-border" />
                    <figcaption className="text-center text-[11px] text-muted-foreground">Figma</figcaption>
                  </figure>
                )}
                {result.screenImage && (
                  <figure className="flex flex-col gap-1.5">
                    <img src={result.screenImage} alt="The phone’s screen" className="max-h-[70vh] rounded-[4px] border border-border" />
                    <figcaption className="text-center text-[11px] text-muted-foreground">{target?.name ?? 'Phone'}</figcaption>
                  </figure>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </>
      )}
      {token && (
        <button type="button" onClick={() => void window.mobMirror.design.clearToken().then(() => setToken(false))} className="self-start text-[11px] text-muted-foreground hover:text-foreground">
          Remove Figma token
        </button>
      )}
    </div>
  )
}
