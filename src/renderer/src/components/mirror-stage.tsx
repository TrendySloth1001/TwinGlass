import { Bot, FileUp, Loader2, LockKeyhole } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { useEffect, useLayoutEffect, useRef, useState, type DragEvent, type ReactNode, type RefObject } from 'react'
import { toast } from 'sonner'
import { BorderBeam } from '@/components/ui/border-beam'
import type { Phase } from '@/hooks/use-mirror'
import type { DeviceAction } from '@shared/shortcuts'
import { FRAME_COLORS, type FrameColor, type FrameSpec } from '@/lib/phone-frames'
import { cn } from '@/lib/utils'

interface MirrorStageProps {
  canvasRef: RefObject<HTMLCanvasElement | null>
  /** Layer for the touch indicator dots (drawn imperatively by TouchOverlay). */
  overlayRef: RefObject<HTMLDivElement | null>
  phase: Phase
  recording: boolean
  /** Phone's lock screen is showing (its PIN screen is black in the mirror). */
  locked: boolean
  /** Package of an app-lock PIN prompt in front of the unlocked phone, if recognised. */
  appPrompt: string | null
  onUnlock: () => void
  /** Open the unlock dialog to type a PIN by hand. */
  onTypePin: () => void
  reconnect: { attempt: number; reason: string } | null
  /** Shown over the stage while nothing is mirrored (the connect screen). */
  idleContent: ReactNode
  /** Phone frame around the mirror (null = none). Only drawn while a video is showing. */
  frame: FrameSpec | null
  frameColor: FrameColor
  /** Video aspect (width / height); the framed screen must match it exactly. */
  aspect: number
  /** Compact window: the frame fills the window exactly (no margin, transparent around it). */
  fit: boolean
  /** Side buttons / home button on the frame. */
  onAction: (a: DeviceAction) => void
  /** The framed phone body's rect (viewport px) whenever it moves or resizes; null without a frame. */
  onFrameRect?: (r: PhoneRect | null) => void
}

export interface PhoneRect {
  x: number
  y: number
  width: number
  height: number
}

/** A physical button on the frame: works like the real one. */
function FrameButton({
  label,
  className,
  onClick,
  background,
}: {
  label: string
  className: string
  onClick: () => void
  background?: string
}): ReactNode {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      style={background ? { background } : undefined}
      className={cn('absolute cursor-pointer transition-[filter] hover:brightness-125 active:brightness-90', className)}
    />
  )
}

async function dropFiles(fileList: FileList): Promise<void> {
  const files = [...fileList]
  if (!files.length) return
  const apk = files.some((f) => f.name.toLowerCase().endsWith('.apk'))
  const id = toast.loading(apk ? 'Installing…' : `Copying ${files.length} file(s)…`)
  const results = await window.mobMirror.dropFiles(files)
  const failed = results.filter((r) => !r.ok)
  const lines = results.map((r) => `${r.ok ? '✓' : '✗'} ${r.name}: ${r.message}`).join('\n')
  if (failed.length) toast.error(`${failed.length} of ${results.length} failed`, { id, description: lines })
  else toast.success(results.length === 1 ? 'Done' : `${results.length} files done`, { id, description: lines })
}

export function MirrorStage({
  canvasRef,
  overlayRef,
  phase,
  recording,
  locked,
  appPrompt,
  onUnlock,
  onTypePin,
  reconnect,
  idleContent,
  frame: frameProp,
  frameColor,
  aspect,
  fit,
  onAction,
  onFrameRect,
}: MirrorStageProps): ReactNode {
  const [dragging, setDragging] = useState(false)
  const live = phase === 'live'
  // A frame needs the video's shape; while connecting/idle the plain stage is shown.
  const frame = frameProp && aspect > 0 && (live || phase === 'reconnecting') ? frameProp : null
  const color = FRAME_COLORS[frameColor]

  // Report where the phone body actually is, so the strip and nav dock can attach to it exactly
  // (at any window shape: live resize, minimum size, full screen), not to the window edges.
  const bodyRef = useRef<HTMLDivElement>(null)
  const lastRect = useRef('')
  useLayoutEffect(() => {
    const el = bodyRef.current
    if (!onFrameRect) return
    if (!el || !frame) {
      if (lastRect.current !== 'none') {
        lastRect.current = 'none'
        onFrameRect(null)
      }
      return
    }
    const report = (): void => {
      const r = el.getBoundingClientRect()
      const key = `${r.x.toFixed(1)},${r.y.toFixed(1)},${r.width.toFixed(1)},${r.height.toFixed(1)}`
      if (key === lastRect.current) return
      lastRect.current = key
      onFrameRect({ x: r.x, y: r.y, width: r.width, height: r.height })
    }
    report()
    const ro = new ResizeObserver(report)
    ro.observe(el)
    if (el.parentElement) ro.observe(el.parentElement)
    window.addEventListener('resize', report)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', report)
    }
  }, [frame, aspect, fit, onFrameRect])

  // What an agent (via MCP) just did: shown for a few seconds so the user always knows.
  const [agent, setAgent] = useState<{ summary: string; at: number } | null>(null)
  useEffect(() => {
    let timer = 0
    const off = window.mobMirror.onAgentActivity((a) => {
      setAgent(a)
      clearTimeout(timer)
      timer = window.setTimeout(() => setAgent(null), 3500)
    })
    return () => {
      off()
      clearTimeout(timer)
    }
  }, [])

  const onDragOver = (e: DragEvent): void => {
    if (!live || !e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setDragging(true)
  }
  const onDrop = (e: DragEvent): void => {
    e.preventDefault()
    setDragging(false)
    if (live && e.dataTransfer.files.length) void dropFiles(e.dataTransfer.files)
  }

  return (
    <div
      // Follows the app theme (light grey / near-black); the compact phone block forces dark.
      // container-type size: the framed phone is sized from the stage with cqw/cqh units.
      className={cn('relative min-h-0 flex-1 overflow-hidden [container-type:size]', !(frame && fit) && 'bg-stage')}
      onDragOver={onDragOver}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      {/* The tree body > glass > screen > canvas never changes (the decoder is bound to the
          canvas); without a frame the wrappers simply fill the stage. */}
      <div
        ref={bodyRef}
        // Centred in the stage. In the compact window the aspect lock makes it fill the stage
        // exactly; the strip and nav dock follow its measured rect either way (onFrameRect).
        className={cn(frame ? 'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2' : 'absolute inset-0')}
        style={
          frame
            ? {
                // --sw = screen width: the largest that fits both ways. Every radius derives from it,
                // so corners stay circular and concentric (screen, glass, rim).
                ['--sw' as string]: `min(100cqw - ${2 * (frame.rim + frame.side) + frame.buttons + (fit ? 0 : 48)}px, (100cqh - ${2 * frame.rim + frame.top + frame.bottom + (fit ? 0 : 48)}px) * ${aspect})`,
                width: `calc(var(--sw) + ${2 * (frame.rim + frame.side)}px)`,
                marginLeft: -frame.buttons / 2,
                padding: frame.rim,
                borderRadius: `calc(var(--sw) * ${frame.screenRadius} + ${frame.side + frame.rim}px)`,
                background: `linear-gradient(145deg, ${color.light}, ${color.dark})`,
                boxShadow: fit
                  ? 'inset 0 0 0 1px rgb(255 255 255 / 0.18)'
                  : 'inset 0 0 0 1px rgb(255 255 255 / 0.18), 0 24px 60px -12px rgb(0 0 0 / 0.55)',
              }
            : undefined
        }
      >
        <div
          className={cn(frame ? 'relative bg-black' : 'size-full')}
          style={
            frame
              ? {
                  padding: `${frame.top}px ${frame.side}px ${frame.bottom}px`,
                  borderRadius: `calc(var(--sw) * ${frame.screenRadius} + ${frame.side}px)`,
                }
              : undefined
          }
        >
          <div
            className={cn('relative', frame ? 'overflow-hidden' : 'size-full')}
            style={frame ? { aspectRatio: String(aspect), borderRadius: `calc(var(--sw) * ${frame.screenRadius})` } : undefined}
          >
            {/* Always mounted: the decoder and input controller attach to this element. */}
            <canvas
              ref={canvasRef}
              tabIndex={0}
              className={cn('block size-full cursor-default object-contain outline-none', !live && 'invisible')}
            />
            <div ref={overlayRef} className="pointer-events-none absolute inset-0 overflow-hidden" />
            {frame?.punchHole && (
              <div
                className="pointer-events-none absolute left-1/2 -translate-x-1/2 rounded-full bg-black shadow-[inset_0_0_0_1.5px_rgb(255_255_255/0.08)]"
                style={{ top: '1.1%', width: '3%', aspectRatio: '1' }}
              />
            )}
          </div>
          {frame?.style === 'classic' && (
            <>
              {/* Earpiece and front camera in the forehead, home button in the chin. */}
              <div className="pointer-events-none absolute top-0 left-1/2 flex -translate-x-1/2 items-center gap-3" style={{ height: frame.top }}>
                <div className="size-2 rounded-full bg-neutral-800 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.1)]" />
                <div className="h-1.5 w-14 rounded-full bg-neutral-800 shadow-[inset_0_1px_1px_rgb(0_0_0/0.8)]" />
                <div className="size-2" />
              </div>
              <div className="absolute bottom-0 left-1/2 grid -translate-x-1/2 place-items-center" style={{ height: frame.bottom }}>
                <FrameButton
                  label="Home"
                  onClick={() => onAction('home')}
                  className="relative! h-9 w-9 rounded-full border border-white/15 bg-white/[0.03]"
                />
              </div>
            </>
          )}
        </div>
        {frame && (
          <>
            {/* Right edge, like most Android phones: volume rocker above the power key. */}
            <FrameButton label="Volume up" background={`linear-gradient(90deg, ${color.dark}, ${color.light})`} onClick={() => onAction('volumeUp')} className="top-[17%] -right-[3px] h-[7%] w-[4px] rounded-r-sm" />
            <FrameButton label="Volume down" background={`linear-gradient(90deg, ${color.dark}, ${color.light})`} onClick={() => onAction('volumeDown')} className="top-[24.5%] -right-[3px] h-[7%] w-[4px] rounded-r-sm" />
            <FrameButton label="Power" background={`linear-gradient(90deg, ${color.dark}, ${color.light})`} onClick={() => onAction('power')} className="top-[35%] -right-[3px] h-[6%] w-[4px] rounded-r-sm" />
          </>
        )}
      </div>

      {phase === 'idle' && (
        <div className="absolute inset-0 overflow-y-auto">
          {/* min-h-full + place-items-center: centred when it fits, scrolls when the window is short. */}
          <div className="flex min-h-full justify-center pt-[7vh] pb-8">{idleContent}</div>
        </div>
      )}

      {phase === 'connecting' && (
        <div className="absolute inset-0 grid place-items-center">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Starting mirror…
          </div>
        </div>
      )}

      {phase === 'reconnecting' && (
        <div className="absolute inset-0 grid place-items-center">
          <div className="flex max-w-80 flex-col items-center gap-2 text-center">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Loader2 className="size-4 animate-spin" /> Reconnecting…
              {reconnect && reconnect.attempt > 0 && (
                <span className="font-normal text-muted-foreground">attempt {reconnect.attempt}</span>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              {reconnect?.reason}. Waiting for the phone to come back on USB or Wi-Fi. Use Disconnect to stop.
            </div>
          </div>
        </div>
      )}

      {dragging && (
        <div className="pointer-events-none absolute inset-3 grid place-items-center rounded-xl border-2 border-dashed border-brand bg-brand/10 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2 text-foreground">
            <FileUp className="size-8" />
            <div className="font-medium">Drop to send to the phone</div>
            <div className="text-xs text-muted-foreground">APKs are installed. Other files go to Downloads.</div>
          </div>
        </div>
      )}

      {live && (locked || appPrompt) && (
        // One line that fits any window: short label, full explanation in the tooltip.
        <div
          title={
            locked
              ? 'The PIN screen is hidden from capture (it shows black), so Twinglass types your PIN for you.'
              : `${appPrompt} is asking for your PIN. The prompt is hidden from capture.`
          }
          className="absolute top-3 left-1/2 z-10 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-neutral-900/90 py-1 pr-1 pl-3 text-xs whitespace-nowrap text-white shadow-lg backdrop-blur"
        >
          <LockKeyhole className="size-3.5 shrink-0 text-warning" />
          <span className="min-w-0 truncate">{locked ? 'Phone locked' : `${appPrompt} wants your PIN`}</span>
          <Button size="xs" variant="secondary" className="shrink-0 rounded-full" onClick={onUnlock}>
            Unlock <Kbd className="ml-0.5 hidden sm:inline-flex">⌘L</Kbd>
          </Button>
          <Button size="xs" variant="ghost" className="shrink-0 rounded-full text-white hover:bg-white/10 hover:text-white" onClick={onTypePin}>
            Type PIN…
          </Button>
        </div>
      )}

      {agent && (
        <div
          key={agent.at}
          className="pointer-events-none absolute top-3 right-3 z-10 flex animate-in items-center gap-2 rounded-full border border-white/10 bg-neutral-900/85 px-3 py-1.5 text-xs text-white shadow-lg backdrop-blur fade-in slide-in-from-top-1"
        >
          <Bot className="size-3.5 text-brand" /> Agent: {agent.summary}
        </div>
      )}

      {recording && <BorderBeam size={180} duration={6} colorFrom="#ef4444" colorTo="#f97316" />}
    </div>
  )
}
