// The developer panel (VS Code's bottom panel): the phone's log, crashes and performance for the app in
// front, or a package you pin. Polls while it's open; nothing changes on the phone.
import { Pin, PinOff, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type Tab = 'logcat' | 'crashes' | 'perf'
type Level = 'V' | 'D' | 'I' | 'W' | 'E'
type Perf = NonNullable<Awaited<ReturnType<typeof window.mobMirror.devPanel.perf>>> & { at: number }

const LEVEL_CLASS: Record<string, string> = { E: 'text-destructive', F: 'text-destructive', W: 'text-warning', I: 'text-foreground', D: 'text-muted-foreground', V: 'text-muted-foreground/70' }
/** threadtime: "11-13 10:39:01.123  1234  1250 W Tag: message" */
const levelOf = (line: string): string => /^\S+ \S+\s+\d+\s+\d+ ([VDIWEF]) /.exec(line)?.[1] ?? ''

function Spark({ values, max, label, unit, warn }: { values: number[]; max: number; label: string; unit: string; warn?: number }): ReactNode {
  const w = 160
  const h = 36
  const top = Math.max(max, ...values, 1)
  const pts = values.map((v, i) => `${(i / Math.max(values.length - 1, 1)) * w},${h - (v / top) * h}`).join(' ')
  const last = values.at(-1)
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-3 text-[11px]">
        <span className="text-muted-foreground uppercase">{label}</span>
        <span className={cn('font-mono tabular-nums', warn !== undefined && last !== undefined && last > warn && 'text-warning')}>
          {last === undefined ? '—' : `${last}${unit}`}
        </span>
      </div>
      <svg width={w} height={h} className="overflow-visible">
        <rect width={w} height={h} className="fill-foreground/[0.04]" />
        {values.length > 1 && <polyline points={pts} fill="none" className="stroke-primary" strokeWidth="1.5" />}
      </svg>
    </div>
  )
}

export function DevPanel({ target, height, onResize, onClose }: { target: { serial: string; name: string } | null; height: number; onResize: (h: number) => void; onClose: () => void }): ReactNode {
  const [tab, setTab] = useState<Tab>('logcat')
  const [front, setFront] = useState<string | null>(null)
  const [pinned, setPinned] = useState<string | null>(null)
  const [pinDraft, setPinDraft] = useState('')
  const [level, setLevel] = useState<Level>('V')
  const [filter, setFilter] = useState('')
  const [log, setLog] = useState('')
  const [clearedAt, setClearedAt] = useState<string | null>(null)
  const [crashes, setCrashes] = useState('')
  const [perf, setPerf] = useState<Perf[]>([])
  const [error, setError] = useState<string | null>(null)
  const pkg = pinned ?? front ?? undefined
  const scroller = useRef<HTMLDivElement>(null)
  const stick = useRef(true)

  // The app in front (when not pinned), every 4 s.
  useEffect(() => {
    if (!target || pinned) return
    let alive = true
    const tick = (): void =>
      void window.mobMirror.devPanel.front(target.serial).then(
        (p) => alive && setFront(p),
        () => {},
      )
    tick()
    const t = setInterval(tick, 4000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [target, pinned])

  // The open tab's data: log every 2 s, crashes every 8 s, performance every 3 s.
  useEffect(() => {
    if (!target) return
    let alive = true
    const run = async (): Promise<void> => {
      try {
        if (tab === 'logcat') {
          const out = await window.mobMirror.devPanel.logcat(target.serial, pkg, level === 'V' ? undefined : level)
          if (alive) setLog(out)
        } else if (tab === 'crashes') {
          const out = await window.mobMirror.devPanel.crashes(target.serial, pkg)
          if (alive) setCrashes(out)
        } else if (pkg) {
          const p = await window.mobMirror.devPanel.perf(target.serial, pkg)
          if (alive && p) setPerf((h) => [...h.slice(-59), { ...p, at: Date.now() }])
        }
        if (alive) setError(null)
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e))
      }
    }
    void run()
    const t = setInterval(() => void run(), tab === 'logcat' ? 2000 : tab === 'crashes' ? 8000 : 3000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [target, tab, pkg, level])
  useEffect(() => setPerf([]), [pkg])

  const lines = useMemo(() => {
    let all = log.split('\n').filter(Boolean)
    if (clearedAt) {
      const i = all.lastIndexOf(clearedAt)
      if (i >= 0) all = all.slice(i + 1)
    }
    const f = filter.toLowerCase()
    return f ? all.filter((l) => l.toLowerCase().includes(f)) : all
  }, [log, filter, clearedAt])
  useEffect(() => {
    const el = scroller.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [lines, crashes, tab])

  const tabBtn = (t: Tab, label: string): ReactNode => (
    <button
      type="button"
      onClick={() => setTab(t)}
      className={cn('h-full border-b border-transparent px-1 text-[11px] uppercase', tab === t ? 'border-foreground text-foreground' : 'text-muted-foreground hover:text-foreground')}
    >
      {label}
    </button>
  )

  return (
    <section aria-label="Developer panel" className="relative flex shrink-0 flex-col border-t border-border bg-background" style={{ height }}>
      {/* Drag the top edge to resize. */}
      <div
        aria-hidden
        className="absolute inset-x-0 -top-1 z-10 h-2 cursor-row-resize"
        onPointerDown={(e) => {
          const startY = e.clientY
          const startH = height
          const move = (ev: PointerEvent): void => onResize(Math.min(Math.max(startH + (startY - ev.clientY), 120), window.innerHeight * 0.7))
          const up = (): void => {
            window.removeEventListener('pointermove', move)
            window.removeEventListener('pointerup', up)
          }
          window.addEventListener('pointermove', move)
          window.addEventListener('pointerup', up)
        }}
      />
      <div className="flex h-[35px] shrink-0 items-stretch gap-4 px-4">
        {tabBtn('logcat', 'Logcat')}
        {tabBtn('crashes', 'Crashes')}
        {tabBtn('perf', 'Performance')}
        <div className="ml-auto flex items-center gap-1.5 text-[12px]">
          <span className="whitespace-nowrap text-muted-foreground">{pinned ? "Pinned" : "App in front"}:</span>
          {pinned ? (
            <span className="font-mono">{pinned}</span>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (/^[A-Za-z][\w]*(\.[\w]+)+$/.test(pinDraft)) setPinned(pinDraft)
              }}
            >
              <Input value={pinDraft} onChange={(e) => setPinDraft(e.target.value)} placeholder={front ?? 'com.example.app'} className="h-6 w-48 font-mono text-[11px]" />
            </form>
          )}
          <button
            type="button"
            title={pinned ? 'Follow the app in front again' : 'Pin the app in front'}
            onClick={() => (pinned ? setPinned(null) : front && setPinned(front))}
            className="flex size-6 items-center justify-center rounded-[4px] text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
          >
            {pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
          </button>
          {tab === 'logcat' && (
            <>
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value as Level)}
                aria-label="Minimum level"
                className="h-6 rounded-[2px] border border-input bg-input-background px-1 text-[11px]"
              >
                {(['V', 'D', 'I', 'W', 'E'] as Level[]).map((l) => (
                  <option key={l} value={l}>
                    {{ V: 'Verbose', D: 'Debug', I: 'Info', W: 'Warning', E: 'Error' }[l]}
                  </option>
                ))}
              </select>
              <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter" className="h-6 w-36 text-[11px]" />
              <button
                type="button"
                title="Clear"
                onClick={() => setClearedAt(log.split('\n').filter(Boolean).at(-1) ?? null)}
                className="flex size-6 items-center justify-center rounded-[4px] text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
              >
                <Trash2 className="size-3.5" />
              </button>
            </>
          )}
          <button type="button" title="Close the panel (⌘J)" onClick={onClose} className="flex size-6 items-center justify-center rounded-[4px] text-muted-foreground hover:bg-foreground/10 hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>
      </div>
      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
        }}
        className="min-h-0 flex-1 overflow-auto px-4 pb-2 font-mono text-[12px] leading-[18px] select-text"
      >
        {!target ? (
          <p className="pt-2 text-muted-foreground">Connect a phone to see its log.</p>
        ) : error ? (
          <p className="pt-2 text-destructive">{error}</p>
        ) : tab === 'logcat' ? (
          lines.map((l, i) => (
            <div key={i} className={cn('whitespace-pre', LEVEL_CLASS[levelOf(l)] ?? 'text-foreground')}>
              {l}
            </div>
          ))
        ) : tab === 'crashes' ? (
          <pre className={cn('whitespace-pre-wrap', crashes.startsWith('No crashes') ? 'text-muted-foreground' : 'text-destructive')}>{crashes}</pre>
        ) : !pkg ? (
          <p className="pt-2 text-muted-foreground">Open an app on the phone, or pin a package.</p>
        ) : (
          <div className="flex flex-wrap gap-8 pt-3 font-sans">
            <Spark label="Janky frames" unit="%" values={perf.map((p) => p.jankyPercent)} max={20} warn={10} />
            <Spark label="Frame time p90" unit=" ms" values={perf.map((p) => p.p90)} max={32} warn={16.7} />
            <Spark label="Memory (PSS)" unit=" MB" values={perf.map((p) => p.pssMb ?? 0)} max={200} />
            <Spark label="CPU" unit="%" values={perf.map((p) => p.cpu ?? 0)} max={100} warn={80} />
            <p className="w-full text-[11px] text-muted-foreground">
              {perf.at(-1) ? `${perf.at(-1)!.frames} frames since the app started drawing (Android’s counters for ${pkg}). Updates every 3 s.` : 'Measuring…'}
            </p>
          </div>
        )}
      </div>
    </section>
  )
}
