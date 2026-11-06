import { Usb, Wifi } from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * Thin title strip of the compact mirror window: draggable, holds the macOS traffic lights
 * (positioned at x 10 / y 7 by the main process) and the phone's name. Height must match
 * COMPACT_TITLE in src/main/window-layout.ts (28 px).
 */
export function CompactTitleBar({ name, transport }: { name: string; transport: 'usb' | 'wifi' | null }): ReactNode {
  return (
    <div className="flex h-7 shrink-0 items-center justify-center gap-1.5 pr-3 pl-[72px] text-[11px] font-medium text-neutral-400 [-webkit-app-region:drag]">
      <span className="truncate">{name || 'Mob Mirror'}</span>
      {transport === 'usb' && <Usb className="size-3 shrink-0" />}
      {transport === 'wifi' && <Wifi className="size-3 shrink-0" />}
    </div>
  )
}
