import { Bot, FileUp, Loader2, LockKeyhole } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { useEffect, useState, type DragEvent, type ReactNode, type RefObject } from 'react'
import { toast } from 'sonner'
import { BorderBeam } from '@/components/ui/border-beam'
import { Ripple } from '@/components/ui/ripple'
import type { Phase } from '@/hooks/use-mirror'
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
  reconnect: { attempt: number; reason: string } | null
  /** Shown over the stage while nothing is mirrored (the connect screen). */
  idleContent: ReactNode
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
  reconnect,
  idleContent,
}: MirrorStageProps): ReactNode {
  const [dragging, setDragging] = useState(false)
  const live = phase === 'live'

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
      className="relative min-h-0 flex-1 overflow-hidden bg-stage"
      onDragOver={onDragOver}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      {/* Always mounted: the decoder and input controller attach to this element. */}
      <canvas
        ref={canvasRef}
        tabIndex={0}
        className={cn('block size-full cursor-default object-contain outline-none', !live && 'invisible')}
      />
      <div ref={overlayRef} className="pointer-events-none absolute inset-0 overflow-hidden" />

      {phase === 'idle' && (
        <div className="absolute inset-0 overflow-y-auto">
          <Ripple mainCircleSize={180} numCircles={6} className="opacity-60" />
          {/* min-h-full + place-items-center: centred when it fits, scrolls when the window is short. */}
          <div className="grid min-h-full place-items-center py-8">{idleContent}</div>
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
              ? 'The PIN screen is hidden from capture (it shows black), so Mob Mirror types your PIN for you.'
              : `${appPrompt} is asking for your PIN. The prompt is hidden from capture.`
          }
          className="absolute top-3 left-1/2 z-10 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-neutral-900/90 py-1 pr-1 pl-3 text-xs whitespace-nowrap text-white shadow-lg backdrop-blur"
        >
          <LockKeyhole className="size-3.5 shrink-0 text-warning" />
          <span className="min-w-0 truncate">{locked ? 'Phone locked' : `${appPrompt} wants your PIN`}</span>
          <Button size="xs" variant="secondary" className="shrink-0 rounded-full" onClick={onUnlock}>
            Unlock <Kbd className="ml-0.5 hidden sm:inline-flex">⌘L</Kbd>
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
