// Design vs screen on our own canvas: side by side, overlay (opacity), swipe (a divider) and
// difference (matching pixels go dark, changes light up in red, with the share of the screen that
// differs). Works with any design image; no Figma account needed.
import { Columns2, Diff, Layers, RefreshCw, SplitSquareHorizontal } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'

type Mode = 'side' | 'overlay' | 'swipe' | 'diff'

function useImage(src: string | null): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  useEffect(() => {
    if (!src) return setImg(null)
    const i = new Image()
    i.onload = () => setImg(i)
    i.src = src
  }, [src])
  return img
}

/** Working width: the screen's own width, at most 720 px (enough to judge, fast to diff). */
const MAX_W = 720

export function DesignOverlay({
  open,
  onOpenChange,
  title,
  design,
  screen,
  onRefreshScreen,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  title: string
  design: string | null
  screen: string | null
  onRefreshScreen?: () => void
}): ReactNode {
  const d = useImage(design)
  const s = useImage(screen)
  const [mode, setMode] = useState<Mode>('overlay')
  const [opacity, setOpacity] = useState(50)
  const [split, setSplit] = useState(50)
  /** Slides the design up/down (designs often leave out the status bar). */
  const [nudge, setNudge] = useState(0)
  const canvas = useRef<HTMLCanvasElement>(null)
  const size = useMemo(() => {
    if (!s) return null
    const w = Math.min(MAX_W, s.naturalWidth)
    return { w, h: Math.round((s.naturalHeight * w) / s.naturalWidth) }
  }, [s])
  const designH = d && size ? Math.round((d.naturalHeight * size.w) / d.naturalWidth) : 0

  // Difference image and the share of pixels that differ (recomputed when the inputs change).
  const diff = useMemo(() => {
    if (!d || !s || !size) return null
    const make = (img: HTMLImageElement, y: number, h: number): ImageData => {
      const c = document.createElement('canvas')
      c.width = size.w
      c.height = size.h
      const x = c.getContext('2d')!
      x.drawImage(img, 0, y, size.w, h)
      return x.getImageData(0, 0, size.w, size.h)
    }
    const a = make(s, 0, size.h)
    const b = make(d, nudge, designH)
    const out = new ImageData(size.w, size.h)
    let changed = 0
    for (let i = 0; i < a.data.length; i += 4) {
      const delta = Math.max(Math.abs(a.data[i]! - b.data[i]!), Math.abs(a.data[i + 1]! - b.data[i + 1]!), Math.abs(a.data[i + 2]! - b.data[i + 2]!))
      const grey = (a.data[i]! * 0.3 + a.data[i + 1]! * 0.59 + a.data[i + 2]! * 0.11) * 0.35
      if (delta > 40) {
        changed++
        out.data[i] = 255
        out.data[i + 1] = 70
        out.data[i + 2] = 70
      } else {
        out.data[i] = out.data[i + 1] = out.data[i + 2] = grey
      }
      out.data[i + 3] = 255
    }
    return { image: out, percent: Math.round((changed / (size.w * size.h)) * 1000) / 10 }
  }, [d, s, size, designH, nudge])

  useEffect(() => {
    const c = canvas.current
    if (!c || !size || !d || !s || mode === 'side') return
    c.width = size.w
    c.height = size.h
    const x = c.getContext('2d')!
    x.clearRect(0, 0, size.w, size.h)
    if (mode === 'diff' && diff) return x.putImageData(diff.image, 0, 0)
    x.drawImage(s, 0, 0, size.w, size.h)
    if (mode === 'overlay') {
      x.globalAlpha = opacity / 100
      x.drawImage(d, 0, nudge, size.w, designH)
      x.globalAlpha = 1
    } else if (mode === 'swipe') {
      const at = Math.round((split / 100) * size.w)
      x.save()
      x.beginPath()
      x.rect(0, 0, at, size.h)
      x.clip()
      x.fillStyle = '#000'
      x.fillRect(0, 0, at, size.h)
      x.drawImage(d, 0, nudge, size.w, designH)
      x.restore()
      x.fillStyle = '#7c5cff'
      x.fillRect(at - 1, 0, 2, size.h)
    }
  }, [mode, size, d, s, opacity, split, nudge, diff, designH])

  const slider = (label: string, value: number, set: (v: number) => void, min: number, max: number, unit = '%'): ReactNode => (
    <label className="flex items-center gap-2 text-[12px]">
      <span className="w-14 shrink-0 text-muted-foreground">{label}</span>
      <input type="range" min={min} max={max} value={value} onChange={(e) => set(Number(e.target.value))} className="w-40 accent-[var(--primary)]" />
      <span className="w-12 text-right tabular-nums">
        {value}
        {unit}
      </span>
    </label>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100vh-40px)] w-auto max-w-[calc(100vw-40px)] flex-col gap-3 overflow-hidden sm:max-w-none">
        <DialogTitle className="flex items-center gap-2 pr-8 text-[14px]">
          {title}
          {mode === 'diff' && diff && (
            <span className={cn('rounded-[3px] px-1.5 py-0.5 text-[11px] font-medium', diff.percent > 5 ? 'bg-destructive/15 text-destructive' : 'bg-success/15 text-success')}>
              {diff.percent}% of the screen differs
            </span>
          )}
        </DialogTitle>
        <DialogDescription className="sr-only">Compare the design image with the phone’s screen</DialogDescription>
        <div className="flex flex-wrap items-center gap-3">
          <ToggleGroup type="single" value={mode} onValueChange={(v) => v && setMode(v as Mode)} variant="outline" size="sm">
            <ToggleGroupItem value="side" aria-label="Side by side">
              <Columns2 /> Side by side
            </ToggleGroupItem>
            <ToggleGroupItem value="overlay" aria-label="Overlay">
              <Layers /> Overlay
            </ToggleGroupItem>
            <ToggleGroupItem value="swipe" aria-label="Swipe">
              <SplitSquareHorizontal /> Swipe
            </ToggleGroupItem>
            <ToggleGroupItem value="diff" aria-label="Difference">
              <Diff /> Difference
            </ToggleGroupItem>
          </ToggleGroup>
          {mode === 'overlay' && slider('Design', opacity, setOpacity, 0, 100)}
          {mode === 'swipe' && slider('Divider', split, setSplit, 0, 100)}
          {mode !== 'side' && slider('Nudge', nudge, setNudge, -200, 200, ' px')}
          {onRefreshScreen && (
            <Button size="sm" variant="secondary" onClick={onRefreshScreen} className="ml-auto">
              <RefreshCw /> Grab the screen again
            </Button>
          )}
        </div>
        <div className="flex min-h-0 flex-1 justify-center overflow-auto">
          {mode === 'side' ? (
            <div className="flex gap-4">
              {[
                [design, 'Design'],
                [screen, 'Phone'],
              ].map(([src, label]) =>
                src ? (
                  <figure key={label} className="flex flex-col items-center gap-1.5">
                    <img src={src} alt={label!} style={{ width: size?.w ?? 360 }} className="max-h-[70vh] w-auto rounded-[4px] border border-border object-contain" />
                    <figcaption className="text-[11px] text-muted-foreground">{label}</figcaption>
                  </figure>
                ) : null,
              )}
            </div>
          ) : (
            <canvas ref={canvas} className="max-h-[70vh] w-auto rounded-[4px] border border-border" aria-label="Design compared with the phone’s screen" />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
