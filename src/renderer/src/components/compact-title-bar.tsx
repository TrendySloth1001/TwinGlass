import { Usb, Wifi } from 'lucide-react'
import type { ReactNode } from 'react'
import { FRAMED_TITLE, TITLE } from '@shared/compact-layout'

/**
 * Thin title strip of the compact mirror window: draggable, holds the macOS traffic lights
 * (positioned at x 10 / y 7 by the main process) and the phone's name. Height must match
 * TITLE / FRAMED_TITLE in src/shared/compact-layout.ts.
 */
export function CompactTitleBar({
  name,
  transport,
  floating,
  inset = 0,
}: {
  name: string
  transport: 'usb' | 'wifi' | null
  /**
   * Over the desktop (phone frame on, transparent window): the traffic lights and the name sit on
   * dock-style pills, the same surface as the control strip, so they stay readable on any wallpaper.
   */
  floating?: boolean
  /** Width of the frame's side-button nubs: the name is centred over the phone body, not the strip. */
  inset?: number
}): ReactNode {
  const dock = 'rounded-full border border-sidebar-border bg-sidebar shadow-sm'
  if (floating) {
    return (
      <div className="relative shrink-0 text-[11px] font-medium [-webkit-app-region:drag]" style={{ height: FRAMED_TITLE }}>
        {/* Behind the native traffic lights (x 10, y 7, ~52 px wide): 22 px pill centred on y 14. */}
        <div aria-hidden className={`absolute top-[3px] left-[3px] h-[22px] w-[66px] ${dock}`} />
        <span
          className={`absolute top-[3px] flex h-[22px] min-w-0 -translate-x-1/2 items-center gap-1.5 px-2.5 text-foreground ${dock}`}
          // Centred on the phone body; never under the traffic-light pill (75 px on each side).
          style={{ left: `calc(50% - ${inset / 2}px)`, maxWidth: `calc(100% - ${150 + inset}px)` }}
        >
          <span className="truncate">{name || 'Twinglass'}</span>
          {transport === 'usb' && <Usb className="size-3 shrink-0" />}
          {transport === 'wifi' && <Wifi className="size-3 shrink-0" />}
        </span>
      </div>
    )
  }
  return (
    <div
      className="flex shrink-0 items-center justify-center gap-1.5 pr-3 pl-[72px] text-[11px] font-medium text-muted-foreground [-webkit-app-region:drag]"
      style={{ height: TITLE }}
    >
      <span className="contents">
        <span className="truncate">{name || 'Twinglass'}</span>
        {transport === 'usb' && <Usb className="size-3 shrink-0" />}
        {transport === 'wifi' && <Wifi className="size-3 shrink-0" />}
      </span>
    </div>
  )
}
