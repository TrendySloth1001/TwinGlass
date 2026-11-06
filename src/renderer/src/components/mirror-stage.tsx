import { FileUp, Loader2, Smartphone } from 'lucide-react'
import { useState, type DragEvent, type ReactNode, type RefObject } from 'react'
import { toast } from 'sonner'
import { BorderBeam } from '@/components/ui/border-beam'
import { Ripple } from '@/components/ui/ripple'
import type { Phase } from '@/hooks/use-mirror'
import { cn } from '@/lib/utils'

interface MirrorStageProps {
  canvasRef: RefObject<HTMLCanvasElement | null>
  phase: Phase
  recording: boolean
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

export function MirrorStage({ canvasRef, phase, recording }: MirrorStageProps): ReactNode {
  const [dragging, setDragging] = useState(false)
  const live = phase === 'live'

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
      // The stage is always dark, so scope the dark theme tokens to it (Ripple uses `foreground`).
      className="dark relative min-h-0 flex-1 overflow-hidden bg-stage"
      onDragOver={onDragOver}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      {/* Always mounted: the decoder and input controller attach to this element. */}
      <canvas
        ref={canvasRef}
        tabIndex={0}
        className={cn('block size-full object-contain outline-none', !live && 'invisible')}
      />

      {phase === 'idle' && (
        <div className="absolute inset-0 grid place-items-center overflow-hidden">
          <Ripple mainCircleSize={180} numCircles={6} className="opacity-60" />
          <div className="relative z-10 flex flex-col items-center gap-3 text-center text-neutral-300">
            <div className="grid size-14 place-items-center rounded-2xl border border-white/10 bg-white/5 backdrop-blur">
              <Smartphone className="size-7" />
            </div>
            <div className="text-base font-medium text-white">No device mirrored</div>
            <div className="max-w-64 text-xs text-neutral-400">
              Pick a phone in the sidebar. Click and drag to touch, scroll to scroll, type to type.
            </div>
          </div>
        </div>
      )}

      {phase === 'connecting' && (
        <div className="absolute inset-0 grid place-items-center">
          <div className="flex items-center gap-2 text-sm text-neutral-300">
            <Loader2 className="size-4 animate-spin" /> Starting mirror…
          </div>
        </div>
      )}

      {dragging && (
        <div className="pointer-events-none absolute inset-3 grid place-items-center rounded-xl border-2 border-dashed border-brand bg-brand/10 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2 text-white">
            <FileUp className="size-8" />
            <div className="font-medium">Drop to send to the phone</div>
            <div className="text-xs text-neutral-300">APKs are installed. Other files go to Downloads.</div>
          </div>
        </div>
      )}

      {recording && <BorderBeam size={180} duration={6} colorFrom="#ef4444" colorTo="#f97316" />}
    </div>
  )
}
