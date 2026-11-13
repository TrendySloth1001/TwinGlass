// Design check: compare a design with the phone's screen. Drop or paste any design image (no account
// needed) and look at both on our own canvas; or paste a Figma frame link for a measured list of what's
// off (texts, positions, widths, font sizes, colours).
import { ChevronRight, ExternalLink, Frame, ImageUp, KeyRound, Loader2, Ruler } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import type { DesignCompareResult } from '../../../main/design-ipc'
import { DesignOverlay } from '@/components/design-overlay'
import { Button } from '@/components/ui/button'
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

const clean = (e: unknown): string => (e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e))

function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('That isn’t an image. Use a PNG or JPG of the design.'))
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(new Error('Couldn’t read that file.'))
    r.readAsDataURL(file)
  })
}

export function DesignView({ target }: { target: { serial: string; name: string } | null }): ReactNode {
  // ---- a design image, compared on our canvas ----
  const [viewer, setViewer] = useState<{ title: string; design: string; screen: string | null } | null>(null)
  const [grabbing, setGrabbing] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const grab = async (): Promise<string | null> => {
    if (!target) {
      toast.error('Connect a phone first.')
      return null
    }
    setGrabbing(true)
    try {
      return await window.mobMirror.design.screen(target.serial)
    } catch (e) {
      toast.error('Couldn’t grab the phone’s screen', { description: clean(e) })
      return null
    } finally {
      setGrabbing(false)
    }
  }
  const useDesign = async (file: File | undefined, name?: string): Promise<void> => {
    if (!file) return
    try {
      const design = await readImage(file)
      const screen = await grab()
      if (screen) setViewer({ title: name ?? file.name ?? 'Design', design, screen })
    } catch (e) {
      toast.error(clean(e))
    }
  }

  // ---- a Figma frame, measured ----
  const [figmaOpen, setFigmaOpen] = useState(false)
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
  useEffect(() => void window.mobMirror.design.tokenStatus().then((s) => setToken(s.saved), () => setToken(false)), [])
  const saveToken = async (): Promise<void> => {
    try {
      const r = await window.mobMirror.design.setToken(draft)
      setToken(true)
      setDraft('')
      toast.success('Figma connected', { description: r.handle ? `Signed in as ${r.handle}. The token is kept encrypted on this Mac.` : undefined })
    } catch (e) {
      toast.error('Couldn’t use that token', { description: clean(e) })
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
      toast.error('Couldn’t compare', { description: clean(e) })
    } finally {
      setBusy(false)
    }
  }
  const r = result?.report

  return (
    <div className="flex flex-col gap-3 px-3 pt-1 pb-3 text-[12px]">
      {/* Any design image: drop, paste or choose. */}
      <div
        tabIndex={0}
        role="button"
        aria-label="Drop, paste or choose a design image"
        onClick={() => fileInput.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileInput.current?.click()}
        onPaste={(e) => {
          const f = [...e.clipboardData.files].find((x) => x.type.startsWith('image/'))
          if (f) {
            e.preventDefault()
            void useDesign(f, 'Pasted design')
          }
        }}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          void useDesign(e.dataTransfer.files[0])
        }}
        className={cn(
          'flex cursor-pointer flex-col items-center gap-1.5 rounded-[4px] border border-dashed border-border-strong px-3 py-5 text-center outline-none transition-colors hover:border-primary/60 focus-visible:border-primary',
          dragOver && 'border-primary bg-primary/10',
        )}
      >
        {grabbing ? <Loader2 className="size-5 animate-spin text-primary" /> : <ImageUp className="size-5 text-primary" />}
        <span className="font-medium">Compare with a design image</span>
        <span className="text-muted-foreground">
          Drop a PNG or JPG, paste it (⌘V) or click to choose. It’s laid over {target ? target.name : 'the phone'}’s screen here, nothing is uploaded.
        </span>
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            void useDesign(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </div>

      {/* Figma: a measured list of differences. */}
      <section className="border-t border-border pt-2">
        <button type="button" onClick={() => setFigmaOpen((o) => !o)} aria-expanded={figmaOpen} className="flex w-full items-center gap-1 text-left label-mono">
          <ChevronRight className={cn('size-4 transition-transform', figmaOpen && 'rotate-90')} />
          From a Figma frame
        </button>
        {figmaOpen && token === false && (
          <div className="mt-2 flex flex-col gap-2">
            <p className="leading-snug text-muted-foreground">
              Measures every text against the frame: missing or extra, and position, width, font size and colour that are off. Needs a Figma personal access token
              (read-only is enough), kept encrypted on this Mac and only sent to Figma.
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
        )}
        {figmaOpen && token && (
          <div className="mt-2 flex flex-col gap-2">
            <form
              className="flex flex-col gap-1.5"
              onSubmit={(e) => {
                e.preventDefault()
                void compare()
              }}
            >
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Figma frame link (Copy link to selection)" className="text-[12px]" />
              <Button type="submit" size="sm" disabled={!url.trim() || busy || !target}>
                {busy ? <Loader2 className="animate-spin" /> : <Ruler />} {target ? `Measure against ${target.name}` : 'Connect a phone first'}
              </Button>
            </form>
            {r && (
              <>
                <div className="flex items-center gap-2 border-t border-border pt-2">
                  <Frame className="size-4 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate font-medium">{r.frame}</span>
                  {result.designImage && (
                    <Button size="xs" variant="secondary" onClick={() => setViewer({ title: r.frame, design: result.designImage!, screen: result.screenImage ?? null })}>
                      Look
                    </Button>
                  )}
                </div>
                <p className="text-muted-foreground">
                  {r.matched} texts matched · {r.issues.length ? `${r.issues.length} to look at` : 'everything matches'}
                  {r.offset.dx || r.offset.dy ? ` · content offset ${r.offset.dx}, ${r.offset.dy} dp (ignored)` : ''}
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
              </>
            )}
            <button type="button" onClick={() => void window.mobMirror.design.clearToken().then(() => setToken(false))} className="self-start text-[11px] text-muted-foreground hover:text-foreground">
              Remove Figma token
            </button>
          </div>
        )}
      </section>

      <DesignOverlay
        open={!!viewer}
        onOpenChange={(o) => !o && setViewer(null)}
        title={viewer?.title ?? ''}
        design={viewer?.design ?? null}
        screen={viewer?.screen ?? null}
        onRefreshScreen={() =>
          void grab().then((screen) => {
            if (screen) setViewer((v) => (v ? { ...v, screen } : v))
          })
        }
      />
    </div>
  )
}
