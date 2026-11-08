import type { ReactNode } from 'react'
import { SHORTCUTS, acceleratorLabel } from '@shared/shortcuts'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Kbd } from '@/components/ui/kbd'
import { Separator } from '@/components/ui/separator'
import { SectionHeader } from '@/components/section-header'

const GESTURES: [string, string][] = [
  ['Click', 'Tap'],
  ['Click and hold', 'Long-press'],
  ['Drag', 'Swipe / drag'],
  ['⌥ Drag', 'Pinch & rotate (around screen centre)'],
  ['⌥⇧ Drag', 'Two-finger vertical swipe'],
  ['Trackpad pinch', 'Pinch-zoom at the cursor'],
  ['Scroll / two-finger scroll', 'Scroll'],
  ['Right-click', 'Back'],
  ['Middle-click', 'Home'],
  ['Type', 'Text into the focused field'],
  ['⌘V', 'Paste Mac clipboard into the phone'],
  ['⌘C / ⌘X', 'Copy / cut on the phone (syncs to the Mac)'],
]

function Row({ keys, action }: { keys: string; action: string }): ReactNode {
  return (
    <div className="flex items-center justify-between gap-4 py-1 text-sm">
      <span className="text-muted-foreground">{action}</span>
      <Kbd className="shrink-0 whitespace-nowrap">{keys}</Kbd>
    </div>
  )
}

export function ControlsHelp({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }): ReactNode {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Controlling the phone</DialogTitle>
          <DialogDescription>Click the mirror first so it has keyboard focus.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-x-8 sm:grid-cols-2">
          <section>
            <SectionHeader className="mb-1">Mouse & trackpad</SectionHeader>
            {GESTURES.map(([keys, action]) => (
              <Row key={keys} keys={keys} action={action} />
            ))}
          </section>
          <Separator className="my-3 sm:hidden" />
          <section>
            <SectionHeader className="mb-1">Shortcuts</SectionHeader>
            {SHORTCUTS.map((s) => (
              <Row key={s.action} keys={acceleratorLabel(s.accelerator)} action={s.label} />
            ))}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
