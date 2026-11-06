import { Usb, Wifi } from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * Thin title strip of the compact mirror window: draggable, holds the macOS traffic lights
 * (positioned at x 10 / y 7 by the main process) and the phone's name. Height must match
 * COMPACT_TITLE in src/main/window-layout.ts (28 px).
 */
export function CompactTitleBar({
  name,
  transport,
  floating,
}: {
  name: string
  transport: 'usb' | 'wifi' | null
  /**
   * Over the desktop (phone frame on, transparent window): the traffic lights and the name sit on
   * dock-style pills, the same surface as the control strip, so they stay readable on any wallpaper.
   */
  floating?: boolean
}): ReactNode {
  const dock = 'rounded-full border border-sidebar-border bg-sidebar shadow-sm'
  return (
    <div className="relative flex h-7 shrink-0 items-center justify-center gap-1.5 pr-3 pl-[72px] text-[11px] font-medium text-neutral-400 [-webkit-app-region:drag]">
      {/* Behind the native traffic lights (x 10, y 7, ~52 px wide). */}
      {floating && <div aria-hidden className={`absolute top-[3px] left-[3px] h-[22px] w-[66px] ${dock}`} />}
      <span className={floating ? `flex h-[22px] min-w-0 items-center gap-1.5 px-2.5 text-neutral-300 ${dock}` : 'contents'}>
        <span className="truncate">{name || 'Mob Mirror'}</span>
        {transport === 'usb' && <Usb className="size-3 shrink-0" />}
        {transport === 'wifi' && <Wifi className="size-3 shrink-0" />}
      </span>
    </div>
  )
}
