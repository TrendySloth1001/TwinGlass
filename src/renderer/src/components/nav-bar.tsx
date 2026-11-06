import { ArrowLeft, House, SquareStack } from 'lucide-react'
import type { ReactNode } from 'react'
import type { DeviceAction } from '@shared/shortcuts'
import { shortcutFor } from '@shared/shortcuts'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Kbd } from '@/components/ui/kbd'

import { GAP, NAV, NAV_DOCK } from '@shared/compact-layout'

/** Height the bar adds to the compact window (shared with main via compact-layout.ts). */
export const NAV_BAR_HEIGHT = NAV

const KEYS: { action: DeviceAction; label: string; icon: ReactNode }[] = [
  { action: 'back', label: 'Back', icon: <ArrowLeft /> },
  { action: 'home', label: 'Home', icon: <House /> },
  { action: 'recents', label: 'Recent apps', icon: <SquareStack /> },
]

/** Android-style navigation bar under the phone (Settings → Window → Navigation bar). */
export function NavBar({
  onAction,
  disabled,
  floating,
  inset = 0,
}: {
  onAction: (a: DeviceAction) => void
  disabled: boolean
  /** Under a phone frame: a dock-style bar (same surface as the control strip). */
  floating?: boolean
  /** Right inset so the dock is exactly as wide as the phone body (side-button nubs excluded). */
  inset?: number
}): ReactNode {
  return (
    <div
      className={
        floating
          ? 'flex shrink-0 items-center gap-1 rounded-2xl border border-sidebar-border bg-sidebar px-1.5 text-foreground shadow-sm'
          : 'flex shrink-0 items-center gap-1 px-3 text-foreground'
      }
      style={floating ? { height: NAV_DOCK, marginTop: GAP, marginRight: inset } : { height: NAV }}
    >
      {KEYS.map((k) => (
        <Tooltip key={k.action}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              aria-label={k.label}
              disabled={disabled}
              onClick={() => onAction(k.action)}
              className={floating ? 'h-7 flex-1 rounded-xl [-webkit-app-region:no-drag]' : 'h-8 flex-1 rounded-full [-webkit-app-region:no-drag]'}
            >
              {k.icon}
            </Button>
          </TooltipTrigger>
          <TooltipContent className="flex items-center gap-2">
            {k.label} <Kbd>{shortcutFor(k.action)}</Kbd>
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  )
}
