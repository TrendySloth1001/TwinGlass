// Recorded tests in the UI: the recording bar over the mirror, and the Tests view in the side bar
// (list, run with live progress, failure screenshot).
import { Check, ChevronRight, Circle, Crosshair, FlaskConical, Loader2, Play, Square, Trash2, X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { describeStep, type SavedTest, type StepResult, type TestRunResult } from '@shared/tests'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { TestRecorder } from '@/hooks/use-test-recorder'
import { cn } from '@/lib/utils'

/** Over the mirror while recording: steps so far, check mode, save / discard. */
export function RecorderBar({ recorder }: { recorder: TestRecorder }): ReactNode {
  const s = recorder.state
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  if (!s) return null
  const last = s.steps.at(-1)
  return (
    <div className="absolute top-3 left-1/2 z-40 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-2 rounded-[6px] border border-border-strong bg-popover/95 px-2.5 py-1.5 text-[12px] shadow-xl backdrop-blur">
      <Circle className="size-2.5 shrink-0 animate-pulse fill-destructive text-destructive" />
      <span className="shrink-0 font-medium">Recording</span>
      <span className="shrink-0 text-muted-foreground">{s.steps.length} steps</span>
      {last && <span className="hidden max-w-56 truncate text-muted-foreground sm:inline">· {describeStep(last)}</span>}
      <span className="mx-1 h-4 w-px bg-border" />
      {naming ? (
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault()
            void recorder.stop(name || 'Untitled test').then((ok) => ok && setNaming(false))
          }}
        >
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Test name" className="h-6 w-44 text-[12px]" />
          <Button type="submit" size="xs">
            <Check /> Save
          </Button>
          <Button type="button" size="xs" variant="ghost" onClick={() => setNaming(false)}>
            Back
          </Button>
        </form>
      ) : (
        <>
          <Button
            size="xs"
            variant={s.checking ? 'default' : 'secondary'}
            onClick={recorder.toggleCheck}
            title="Add a check: click an element on the mirror that must be on screen"
          >
            <Crosshair /> {s.checking ? 'Click an element…' : 'Check'}
          </Button>
          <Button size="xs" onClick={() => setNaming(true)}>
            <Square className="fill-current" /> Stop
          </Button>
          <Button size="xs" variant="ghost" onClick={recorder.cancel} aria-label="Discard the recording" title="Discard">
            <X />
          </Button>
        </>
      )}
    </div>
  )
}

/** The Tests view: recorded tests, Record, and running one on the phone in front. */
export function TestsView({ target, onRecord }: { target: { serial: string; name: string } | null; onRecord: () => void }): ReactNode {
  const [tests, setTests] = useState<SavedTest[] | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [running, setRunning] = useState<{ name: string; results: StepResult[] } | null>(null)
  const [last, setLast] = useState<TestRunResult | null>(null)
  useEffect(() => {
    const load = (): void => void window.mobMirror.tests.list().then(setTests, () => setTests([]))
    load()
    return window.mobMirror.tests.onChanged(load)
  }, [])
  useEffect(
    () =>
      window.mobMirror.tests.onProgress((r) =>
        setRunning((cur) => (cur && cur.name === r.name ? { ...cur, results: [...cur.results.filter((x) => x.index !== r.index), r] } : cur)),
      ),
    [],
  )
  const run = async (t: SavedTest): Promise<void> => {
    if (!target) return void toast.error('Connect a phone first.')
    setOpen(t.name)
    setLast(null)
    setRunning({ name: t.name, results: [] })
    try {
      const r = await window.mobMirror.tests.run(t.name, target.serial)
      setLast(r)
      if (r.ok) toast.success(`“${t.name}” passed`, { description: `${r.results.length} steps on ${target.name}` })
      else toast.error(`“${t.name}” failed at step ${r.results.length}`, { description: r.results.at(-1)?.message })
    } catch (e) {
      toast.error('Couldn’t run the test', { description: e instanceof Error ? e.message : String(e) })
    } finally {
      setRunning(null)
    }
  }
  return (
    <div className="flex flex-col gap-3 px-3 pt-1 pb-3">
      <Button size="sm" onClick={onRecord} className="w-full">
        <Circle className="fill-destructive text-destructive" /> Record a test
      </Button>
      <p className="text-[12px] leading-snug text-muted-foreground">
        Use the phone on the mirror: every tap is saved by what the element says, so replays survive layout changes. Add checks with <Crosshair className="inline size-3" /> Check.
      </p>
      {tests?.length === 0 && <p className="text-[12px] text-muted-foreground">No tests yet.</p>}
      <ul className="-mx-3 flex flex-col">
        {tests?.map((t) => {
          const isOpen = open === t.name
          const live = running?.name === t.name ? running : null
          const result = last?.name === t.name ? last : null
          const statusOf = (i: number): StepResult | undefined => (live ?? result)?.results.find((r) => r.index === i)
          return (
            <li key={t.name} className="group/test">
              <div className={cn('flex h-[26px] items-center gap-1 pr-2 pl-2 hover:bg-accent', isOpen && 'bg-selection hover:bg-selection')}>
                <button type="button" onClick={() => setOpen(isOpen ? null : t.name)} className="flex min-w-0 flex-1 items-center gap-1 text-left text-[13px]">
                  <ChevronRight className={cn('size-4 shrink-0 transition-transform', isOpen && 'rotate-90')} />
                  {live ? (
                    <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />
                  ) : result ? (
                    result.ok ? (
                      <Check className="size-3.5 shrink-0 text-success" />
                    ) : (
                      <X className="size-3.5 shrink-0 text-destructive" />
                    )
                  ) : (
                    <FlaskConical className="size-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <span className="truncate">{t.name}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{t.steps.length}</span>
                </button>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  disabled={!!running}
                  title={target ? `Run on ${target.name}` : 'Connect a phone first'}
                  aria-label={`Run ${t.name}`}
                  onClick={() => void run(t)}
                  className="[&_svg]:size-4"
                >
                  <Play />
                </Button>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  disabled={!!running}
                  aria-label={`Delete ${t.name}`}
                  title="Delete"
                  onClick={() => void window.mobMirror.tests.delete(t.name)}
                  className="opacity-0 group-hover/test:opacity-100 [&_svg]:size-4"
                >
                  <Trash2 />
                </Button>
              </div>
              {isOpen && (
                <div className="flex flex-col gap-2 pt-1 pr-3 pb-2 pl-8">
                  <ol className="flex flex-col gap-0.5 text-[12px]">
                    {t.steps.map((st, i) => {
                      const r = statusOf(i)
                      return (
                        <li key={i} className={cn('flex items-start gap-1.5', r && !r.ok && 'text-destructive')} title={r?.message}>
                          <span className="mt-0.5 w-4 shrink-0 text-right text-[11px] text-muted-foreground tabular-nums">{i + 1}</span>
                          <span className="flex size-4 shrink-0 items-center justify-center">
                            {r ? r.ok ? <Check className="size-3.5 text-success" /> : <X className="size-3.5" /> : live && live.results.length === i ? <Loader2 className="size-3 animate-spin text-primary" /> : null}
                          </span>
                          <span className="min-w-0">{describeStep(st)}</span>
                        </li>
                      )
                    })}
                  </ol>
                  {result && !result.ok && (
                    <div className="flex flex-col gap-1.5 rounded-[4px] border border-destructive/40 bg-destructive/5 p-2 text-[12px]">
                      <p className="font-medium text-destructive">Failed at step {result.results.length}</p>
                      <p className="text-muted-foreground">{result.results.at(-1)?.message}</p>
                      {result.screenshot && <img src={result.screenshot} alt="The screen when the step failed" className="mt-1 max-h-72 self-start rounded-[4px] border border-border" />}
                    </div>
                  )}
                  {t.device && <p className="text-[11px] text-muted-foreground">Recorded on {t.device}</p>}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
