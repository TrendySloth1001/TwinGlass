import {
  ArrowLeft,
  BellDot,
  Camera,
  Circle,
  Ellipsis,
  House,
  Keyboard,
  LockKeyhole,
  LockKeyholeOpen,
  Monitor,
  MonitorOff,
  PanelLeftOpen,
  Power,
  RotateCw,
  Settings2,
  Square,
  SquareStack,
  Unplug,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { shortcutFor, type DeviceAction } from '@shared/shortcuts'
import { NotificationCenter } from '@/components/notification-center'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Kbd } from '@/components/ui/kbd'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { Mirror } from '@/hooks/use-mirror'
import { cn } from '@/lib/utils'

/** Rail button: icon only, tooltip to the left (the rail sits on the right edge). */
function RailButton({
  label,
  shortcut,
  onClick,
  className,
  children,
}: {
  label: string
  shortcut?: string
  onClick: () => void
  className?: string
  children: ReactNode
}): ReactNode {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          onClick={onClick}
          className={cn('rounded-lg [-webkit-app-region:no-drag]', className)}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="left" className="flex items-center gap-2">
        {label}
        {shortcut && <Kbd>{shortcut}</Kbd>}
      </TooltipContent>
    </Tooltip>
  )
}

const Sep = (): ReactNode => <div className="my-1 h-px w-6 shrink-0 bg-border" />

interface ControlRailProps {
  mirror: Mirror
  onAction: (a: DeviceAction) => void
  onShowHelp: () => void
  /** Leave compact mode: the full view with devices, settings and the toolbar. */
  onFullView: () => void
}

/**
 * Vertical controls on the right of the compact mirror window. Primary actions are always
 * visible; the rest sit in a menu. When the window is short, the middle section scrolls.
 */
export function ControlRail({ mirror, onAction, onShowHelp, onFullView }: ControlRailProps): ReactNode {
  const { state } = mirror
  const live = state.phase === 'live'
  const recording = state.recordingSince !== null
  const run = (a: DeviceAction) => () => onAction(a)
  const sc = (a: DeviceAction): string => shortcutFor(a)

  return (
    <nav
      aria-label="Phone controls"
      className="flex w-12 shrink-0 flex-col items-center rounded-2xl border border-sidebar-border bg-sidebar/90 py-1.5 [-webkit-app-region:no-drag]"
    >
      <div className={cn('flex min-h-0 flex-1 flex-col items-center gap-0.5 overflow-y-auto', !live && 'pointer-events-none opacity-40')}>
        <RailButton label="Back" shortcut={`${sc('back')} · right-click`} onClick={run('back')}>
          <ArrowLeft />
        </RailButton>
        <RailButton label="Home" shortcut={`${sc('home')} · middle-click`} onClick={run('home')}>
          <House />
        </RailButton>
        <RailButton label="Recent apps" shortcut={sc('recents')} onClick={run('recents')}>
          <SquareStack />
        </RailButton>
        <Sep />
        <RailButton label="Volume up" shortcut={sc('volumeUp')} onClick={run('volumeUp')}>
          <Volume2 />
        </RailButton>
        <RailButton label="Volume down" shortcut={sc('volumeDown')} onClick={run('volumeDown')}>
          <Volume1 />
        </RailButton>
        <RailButton label="Power" shortcut={sc('power')} onClick={run('power')}>
          <Power />
        </RailButton>
        <RailButton
          label="Unlock phone (types your PIN)"
          shortcut={sc('unlock')}
          onClick={run('unlock')}
          className={cn(state.locked && 'text-warning')}
        >
          {state.locked ? <LockKeyhole /> : <LockKeyholeOpen />}
        </RailButton>
        <RailButton label="Rotate" shortcut={sc('rotate')} onClick={run('rotate')}>
          <RotateCw />
        </RailButton>
        <Sep />
        <RailButton label="Screenshot" shortcut={sc('screenshot')} onClick={run('screenshot')}>
          <Camera />
        </RailButton>
        <RailButton
          label={recording ? 'Stop recording' : 'Record video'}
          shortcut={sc('record')}
          onClick={run('record')}
          className={cn(recording && 'text-destructive')}
        >
          {recording ? <Square className="fill-current" /> : <Circle className="fill-destructive text-destructive" />}
        </RailButton>
        {state.audio !== 'off' && (
          <RailButton label={state.muted ? 'Unmute' : 'Mute'} onClick={mirror.toggleMute}>
            {state.muted ? <VolumeX /> : <Volume2 />}
          </RailButton>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-center gap-0.5 pt-1">
        <Sep />
        <NotificationCenter />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="More controls" className="rounded-lg [-webkit-app-region:no-drag]">
              <Ellipsis />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="left" align="end" className="w-60">
            <DropdownMenuItem disabled={!live} onSelect={run('notifications')}>
              <BellDot /> Notifications panel
              <DropdownMenuShortcut>{sc('notifications')}</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!live} onSelect={run('quickSettings')}>
              <Settings2 /> Quick settings
              <DropdownMenuShortcut>{sc('quickSettings')}</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!live} onSelect={run('screenOff')}>
              {state.screenOff ? <Monitor /> : <MonitorOff />}
              {state.screenOff ? 'Turn phone screen on' : 'Turn phone screen off'}
              <DropdownMenuShortcut>{sc('screenOff')}</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onShowHelp}>
              <Keyboard /> Controls & shortcuts
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onFullView}>
              <PanelLeftOpen /> Full view (devices & settings)
              <DropdownMenuShortcut>⇧⌘M</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" disabled={state.phase === 'idle'} onSelect={run('disconnect')}>
              <Unplug /> Disconnect
              <DropdownMenuShortcut>{sc('disconnect')}</DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <RailButton label="Full view: devices & settings" shortcut="⇧⌘M" onClick={onFullView}>
          <PanelLeftOpen />
        </RailButton>
      </div>
    </nav>
  )
}
