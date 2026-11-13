// Inspect mode: like a browser's element inspector, over the mirror. Hover an element to see its box,
// size and position in dp, insets, gap, text size and colours; click to pin it, pin a second one to
// measure the space between them. Clicks don't reach the phone while inspecting. R re-reads the
// screen, Esc leaves.
import { Loader2, RefreshCw, ScanSearch, X } from 'lucide-react'
import { useCallback, useEffect, useState, type ReactNode, type RefObject } from 'react'
import type { MapNode, ScreenMap } from '../../../main/agent/screen-map'
import { Button } from '@/components/ui/button'
import { nodeAt, spacing } from '@/lib/inspect'

interface Rect {
  left: number
  top: number
  width: number
  height: number
}

/** Where the video is drawn inside the canvas (object-contain letterboxing). */
function videoRect(canvas: HTMLCanvasElement, aspect: number): Rect {
  const r = canvas.getBoundingClientRect()
  if (!aspect) return { left: r.left, top: r.top, width: r.width, height: r.height }
  const w = Math.min(r.width, r.height * aspect)
  const h = w / aspect
  return { left: r.left + (r.width - w) / 2, top: r.top + (r.height - h) / 2, width: w, height: h }
}

const Swatch = ({ c }: { c?: string }): ReactNode =>
  c ? (
    <span className="inline-flex items-center gap-1">
      <span className="inline-block size-3 rounded-[2px] border border-white/30" style={{ background: c }} />
      {c}
    </span>
  ) : null

function Info({ n, density }: { n: MapNode; density: number }): ReactNode {
  const row = (k: string, v: ReactNode): ReactNode =>
    v === undefined || v === null || v === '' ? null : (
      <div className="flex gap-2">
        <span className="w-14 shrink-0 text-white/50">{k}</span>
        <span className="min-w-0 break-words">{v}</span>
      </div>
    )
  return (
    <div className="flex flex-col gap-0.5">
      <div className="mb-1 flex items-baseline gap-1.5">
        <span className="font-semibold text-white">{n.kind}</span>
        {n.id && <span className="text-[#9cdcfe]">#{n.id}</span>}
      </div>
      {row('text', n.text && `“${n.text.length > 60 ? `${n.text.slice(0, 60)}…` : n.text}”`)}
      {row('size', `${n.w} × ${n.h} dp`)}
      {row('at', `${n.x}, ${n.y} dp`)}
      {row('px', `${n.px[2] - n.px[0]} × ${n.px[3] - n.px[1]} (×${density})`)}
      {row('inset', n.inset && n.inset.join(' · '))}
      {row('gap', n.gap && `${n.gap.dp} dp ${n.gap.axis === 'vertical' ? 'below' : 'right of'} ${n.gap.after}`)}
      {row('layout', n.layout && `${n.layout.width ?? '—'} × ${n.layout.height ?? '—'}`)}
      {row('text size', n.textSize)}
      {row('colour', n.foreground && <Swatch c={n.foreground} />)}
      {row('fill', n.background && <Swatch c={n.background} />)}
      {row('flags', n.flags)}
      {row('app', n.app)}
    </div>
  )
}

export function InspectOverlay({
  canvasRef,
  serial,
  aspect,
  onClose,
}: {
  canvasRef: RefObject<HTMLCanvasElement | null>
  serial: string
  /** Video width / height. */
  aspect: number
  onClose: () => void
}): ReactNode {
  const [map, setMap] = useState<ScreenMap | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [rect, setRect] = useState<Rect | null>(null)
  const [hover, setHover] = useState<MapNode | null>(null)
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null)
  const [pinned, setPinned] = useState<MapNode[]>([])

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    window.mobMirror.inspect.map(serial).then(
      (m) => {
        setMap(m)
        setPinned([])
        setLoading(false)
      },
      (e: unknown) => {
        setError(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e))
        setLoading(false)
      },
    )
  }, [serial])
  useEffect(load, [load])

  // Follow the video's place on screen (window resizes, side bar, rotation).
  useEffect(() => {
    let raf = 0
    const tick = (): void => {
      const c = canvasRef.current
      if (c) {
        const r = videoRect(c, aspect)
        setRect((p) => (p && p.left === r.left && p.top === r.top && p.width === r.width && p.height === r.height ? p : r))
      }
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [canvasRef, aspect])

  useEffect(() => {
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
      else if ((e.key === 'r' || e.key === 'R') && !e.metaKey) load()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose, load])

  if (!rect) return null
  const k = map ? rect.width / map.display.widthPx : 1
  const toPx = (cx: number, cy: number): [number, number] => [(cx - rect.left) / k, (cy - rect.top) / k]
  const box = (n: MapNode, cls: string, label?: string): ReactNode => (
    <div
      key={n.n + cls}
      className={`pointer-events-none absolute ${cls}`}
      style={{ left: n.px[0] * k, top: n.px[1] * k, width: (n.px[2] - n.px[0]) * k, height: (n.px[3] - n.px[1]) * k }}
    >
      {label && <span className="absolute -top-4 left-0 rounded-[2px] bg-inherit px-1 font-mono text-[10px] whitespace-nowrap text-white">{label}</span>}
    </div>
  )
  const between = pinned.length === 2 && map ? spacing(pinned[0]!, pinned[1]!, map.display.density) : null
  const shown = hover ?? pinned.at(-1) ?? null

  return (
    <div
      className="fixed z-40 cursor-crosshair"
      style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
      onPointerMove={(e) => {
        setPointer({ x: e.clientX - rect.left, y: e.clientY - rect.top })
        if (map) setHover(nodeAt(map.nodes, ...toPx(e.clientX, e.clientY)))
      }}
      onPointerLeave={() => {
        setHover(null)
        setPointer(null)
      }}
      onPointerDown={(e) => {
        e.preventDefault()
        e.stopPropagation()
        if (!map) return
        const n = nodeAt(map.nodes, ...toPx(e.clientX, e.clientY))
        if (n) setPinned((p) => (p.length >= 2 ? [n] : [...p.filter((x) => x !== n), n]))
      }}
      onContextMenu={(e) => e.preventDefault()}
      onWheel={(e) => e.stopPropagation()}
    >
      {/* A faint outline of every element, so the structure is visible at a glance. */}
      {map?.nodes.map((n) => box(n, 'border border-sky-400/15'))}
      {pinned.map((n, i) => box(n, 'border-2 border-[#a78bfa] bg-[#a78bfa]/10', `${i + 1} · ${n.w}×${n.h}`))}
      {hover && box(hover, 'border-2 border-sky-400 bg-sky-400/15', `${hover.w}×${hover.h}`)}

      {/* Toolbar. */}
      <div className="absolute top-2 left-1/2 flex max-w-[calc(100%-16px)] -translate-x-1/2 items-center gap-1.5 rounded-[6px] border border-white/15 bg-black/80 px-2 py-1 text-[12px] whitespace-nowrap text-white shadow-xl backdrop-blur">
        <ScanSearch className="size-3.5 text-sky-400" />
        <span className="font-medium">Inspect</span>
        <span className="min-w-0 truncate text-white/60" title="Click an element to pin it; pin two to measure the space between them">
          {loading ? 'reading…' : error ? 'couldn’t read the screen' : `${map?.nodes.length ?? 0} elements · click to pin`}
        </span>
        <Button size="icon-xs" variant="ghost" className="text-white hover:bg-white/15 [&_svg]:size-3.5" onClick={load} title="Read the screen again (R)" aria-label="Read the screen again">
          {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
        </Button>
        <Button size="icon-xs" variant="ghost" className="text-white hover:bg-white/15 [&_svg]:size-3.5" onClick={onClose} title="Leave (Esc)" aria-label="Leave inspect mode">
          <X />
        </Button>
      </div>
      {error && <div className="absolute top-12 left-1/2 max-w-[90%] -translate-x-1/2 rounded-[4px] bg-black/80 px-2 py-1 text-[12px] text-white">{error}</div>}

      {/* The element's details, beside the pointer (or the last pinned one). */}
      {shown && map && (
        <div
          className="pointer-events-none absolute z-10 w-60 rounded-[6px] border border-white/15 bg-[#1f1f1f]/95 p-2.5 font-mono text-[11px] leading-snug text-white/90 shadow-2xl"
          style={
            pointer
              ? { left: Math.min(pointer.x + 16, rect.width - 248), top: Math.min(pointer.y + 16, Math.max(8, rect.height - 260)) }
              : { right: 8, bottom: 8 }
          }
        >
          <Info n={shown} density={map.display.density} />
          {between && (
            <div className="mt-2 border-t border-white/15 pt-1.5 text-[#c4b5fd]">
              {between.inside
                ? `2 inside 1 · insets ${between.inside.join(' · ')} dp`
                : `1 ↔ 2 · ${between.h ? `${between.h} dp apart horizontally` : ''}${between.h && between.v ? ', ' : ''}${between.v ? `${between.v} dp apart vertically` : ''}${!between.h && !between.v ? 'touching' : ''}`}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
