import { ArrowLeft, House, SquareStack } from 'lucide-react'
import type { ReactNode } from 'react'
import type { DeviceAction } from '@shared/shortcuts'
import { shortcutFor } from '@shared/shortcuts'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Kbd } from '@/components/ui/kbd'

/** Height must match NAV_BAR_HEIGHT used for the compact window size (h-10). */
export const NAV_BAR_HEIGHT = 40

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
}: {
  onAction: (a: DeviceAction) => void
  disabled: boolean
  /** Under a phone frame: a dock-style bar (same surface as the control strip). */
  floating?: boolean
}): ReactNode {
  return (
    <div
      className={
        floating
          ? 'mt-1.5 flex h-[34px] shrink-0 items-center gap-1 rounded-2xl border border-sidebar-border bg-sidebar px-1.5 text-foreground shadow-sm'
          : 'flex h-10 shrink-0 items-center gap-1 px-3 text-foreground'
      }
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
