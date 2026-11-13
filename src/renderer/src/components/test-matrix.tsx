// Test matrix: replay one recorded test light, dark and with large text on a second screen of the phone,
// and compare each final screen with the baseline you accepted (visual regression).
import { Check, Diff, Grid2x2, Loader2, TriangleAlert, X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { MATRIX_CONDITIONS, type MatrixCell, type MatrixConditionId } from '@shared/visual-diff'
import { DesignOverlay } from '@/components/design-overlay'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

const clean = (e: unknown): string => (e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e))

const STATUS: Record<MatrixCell['status'], { label: string; className: string }> = {
  failed: { label: 'Failed', className: 'bg-destructive/15 text-destructive' },
  new: { label: 'No baseline', className: 'bg-foreground/10 text-muted-foreground' },
  same: { label: 'Matches baseline', className: 'bg-success/15 text-success' },
  changed: { label: 'Changed', className: 'bg-warning/15 text-warning' },
}

export function TestMatrix({ test, target, open, onOpenChange }: { test: string; target: { serial: string; name: string } | null; open: boolean; onOpenChange: (o: boolean) => void }): ReactNode {
  const [picked, setPicked] = useState<Set<MatrixConditionId>>(() => new Set(['light', 'dark']))
  const [cells, setCells] = useState<Partial<Record<MatrixConditionId, MatrixCell | 'running'>>>({})
  const [running, setRunning] = useState(false)
  const [viewer, setViewer] = useState<MatrixCell | null>(null)

  useEffect(() => {
    if (!open) return
    return window.mobMirror.matrix.onProgress((c) => setCells((s) => ({ ...s, [c.condition]: 'status' in c && c.status === 'running' ? 'running' : (c as MatrixCell) })))
  }, [open])
  useEffect(() => setCells({}), [test])

  const run = async (): Promise<void> => {
    if (!target) return
    setRunning(true)
    setCells({})
    try {
      const r = await window.mobMirror.matrix.run(test, target.serial, [...picked])
      const bad = r.filter((c) => c.status === 'failed' || c.status === 'changed').length
      if (bad) toast.warning(`${bad} of ${r.length} need a look`)
      else toast.success(`“${test}” passed in all ${r.length}`)
    } catch (e) {
      toast.error('The matrix stopped', { description: clean(e) })
    } finally {
      setRunning(false)
    }
  }
  const accept = async (c: MatrixCell): Promise<void> => {
    if (!c.screenshot) return
    try {
      await window.mobMirror.matrix.accept(test, c.condition, c.screenshot)
      setCells((s) => ({ ...s, [c.condition]: { ...c, status: 'same', baseline: c.screenshot, diffPercent: 0 } }))
    } catch (e) {
      toast.error(clean(e))
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !running && onOpenChange(o)}>
      <DialogContent className="flex max-h-[calc(100vh-40px)] flex-col gap-3 overflow-hidden sm:max-w-[min(960px,calc(100vw-40px))]">
        <DialogTitle className="flex items-center gap-2 text-[14px]">
          <Grid2x2 className="size-4 text-muted-foreground" /> Test matrix: {test}
        </DialogTitle>
        <DialogDescription className="text-[12px]">
          Replays the test on a second screen of {target?.name ?? 'the phone'} under each condition and compares the last screen with its baseline.
        </DialogDescription>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px]">
          {MATRIX_CONDITIONS.map((c) => (
            <label key={c.id} className="flex items-center gap-1.5">
              <Checkbox
                checked={picked.has(c.id)}
                disabled={running}
                onCheckedChange={(v) =>
                  setPicked((s) => {
                    const n = new Set(s)
                    if (v) n.add(c.id)
                    else n.delete(c.id)
                    return n
                  })
                }
              />
              {c.label}
            </label>
          ))}
          <Button size="sm" className="ml-auto" disabled={running || !picked.size || !target} onClick={() => void run()}>
            {running ? <Loader2 className="animate-spin" /> : <Grid2x2 />} {running ? 'Running…' : `Run ${picked.size}`}
          </Button>
        </div>
        <p className="flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
          <TriangleAlert className="mt-px size-3.5 shrink-0 text-warning" />
          While it runs, dark mode, text size and animations change on the whole phone. They’re put back when it finishes.
        </p>

        <div className="grid min-h-0 grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3 overflow-auto pb-1">
          {MATRIX_CONDITIONS.filter((c) => picked.has(c.id) || cells[c.id]).map((c) => {
            const cell = cells[c.id]
            const done = cell && cell !== 'running' ? cell : null
            return (
              <figure key={c.id} className="flex flex-col gap-1.5 rounded-[4px] border border-border p-2">
                <figcaption className="flex items-center gap-1.5 text-[12px]">
                  <span className="font-medium">{c.label}</span>
                  {cell === 'running' && <Loader2 className="ml-auto size-3.5 animate-spin text-primary" />}
                  {done && (
                    <span className={cn('ml-auto rounded-[3px] px-1 text-[10px] font-semibold uppercase', STATUS[done.status].className)}>
                      {STATUS[done.status].label}
                      {done.status === 'changed' && ` ${done.diffPercent}%`}
                    </span>
                  )}
                </figcaption>
                <div className="flex aspect-[9/16] items-center justify-center overflow-hidden rounded-[3px] bg-foreground/[0.04]">
                  {done?.screenshot ? (
                    <img src={done.screenshot} alt={`${c.label}: the last screen`} className="size-full object-contain" />
                  ) : (
                    <span className="text-[11px] text-muted-foreground">{cell === 'running' ? 'Running…' : 'Not run yet'}</span>
                  )}
                </div>
                {done?.status === 'failed' && <p className="text-[11px] text-destructive">Step {done.steps}: {done.message}</p>}
                {done && done.status !== 'failed' && (
                  <div className="flex gap-1">
                    {done.baseline && (
                      <Button size="xs" variant="secondary" onClick={() => setViewer(done)}>
                        <Diff /> Compare
                      </Button>
                    )}
                    {done.status !== 'same' && (
                      <Button size="xs" variant="secondary" onClick={() => void accept(done)} title="Keep this screen as the expected result">
                        <Check /> {done.baseline ? 'Accept change' : 'Use as baseline'}
                      </Button>
                    )}
                    {done.status === 'same' && (
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Check className="size-3 text-success" /> {done.diffPercent ? `${done.diffPercent}% pixels differ` : 'identical'}
                      </span>
                    )}
                  </div>
                )}
                {done?.status === 'failed' && !done.screenshot && <X className="size-4 text-destructive" />}
              </figure>
            )
          })}
        </div>

        <DesignOverlay
          open={!!viewer}
          onOpenChange={(o) => !o && setViewer(null)}
          title={viewer ? `${test} · ${viewer.label}` : ''}
          design={viewer?.baseline ?? null}
          screen={viewer?.screenshot ?? null}
          labels={['Baseline', 'Now']}
        />
      </DialogContent>
    </Dialog>
  )
}
