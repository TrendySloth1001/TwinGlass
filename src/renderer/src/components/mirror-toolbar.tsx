import {
  ArrowLeft,
  BellDot,
  Camera,
  Circle,
  House,
  Ellipsis,
  Keyboard,
  PanelLeftClose,
  PanelLeftOpen,
  LockKeyhole,
  LockKeyholeOpen,
  Monitor,
  MonitorOff,
  Power,
  RotateCw,
  Settings2,
  Smartphone,
  Square,
  SquareStack,
  Unplug,
  Usb,
  Volume1,
  Volume2,
  VolumeX,
  Wifi,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { shortcutFor, type DeviceAction } from '@shared/shortcuts'
import { IconButton } from '@/components/icon-button'
import { NotificationCenter } from '@/components/notification-center'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Separator } from '@/components/ui/separator'
import type { Mirror } from '@/hooks/use-mirror'
import { cn } from '@/lib/utils'

function Group({ children }: { children: ReactNode }): ReactNode {
  return <div className="flex items-center gap-0.5">{children}</div>
}

const Divider = (): ReactNode => <Separator orientation="vertical" className="h-5!" />

/** One toolbar button per device action, showing the same shortcut the Device menu uses. */
function Action({
  run,
  action,
  label,
  hint,
  children,
  className,
}: {
  run: (a: DeviceAction) => void
  action: DeviceAction
  label: string
  hint?: string
  children: ReactNode
  className?: string
}): ReactNode {
  return (
    <IconButton
      label={label}
      shortcut={[shortcutFor(action), hint].filter(Boolean).join(' · ')}
      onClick={() => run(action)}
      className={className}
    >
      {children}
    </IconButton>
  )
}

interface ToolbarProps {
  mirror: Mirror
  /** App-level dispatcher (some actions, like unlock, open dialogs). */
  onAction: (a: DeviceAction) => void
  onShowHelp: () => void
  /** No docked sidebar on the left: leave room for the macOS traffic lights. */
  ownsCorner: boolean
  sidebarOpen: boolean
  onToggleSidebar: () => void
  /** Switch to the compact phone-shaped mirror (only while mirroring). */
  onCompact?: () => void
}

export function MirrorToolbar({ mirror, onAction, onShowHelp, ownsCorner, sidebarOpen, onToggleSidebar, onCompact }: ToolbarProps): ReactNode {
  const { state } = mirror
  const live = state.phase === 'live'
  const recording = state.recordingSince !== null

  // Overflow menu entries: shown inline on wide toolbars, folded into "More" on narrow ones.
  const more: { action: DeviceAction; label: string; icon: ReactNode }[] = [
    { action: 'notifications', label: 'Notifications', icon: <BellDot /> },
    { action: 'quickSettings', label: 'Quick settings', icon: <Settings2 /> },
    { action: 'volumeDown', label: 'Volume down', icon: <Volume1 /> },
    { action: 'volumeUp', label: 'Volume up', icon: <Volume2 /> },
    { action: 'power', label: 'Power', icon: <Power /> },
    { action: 'rotate', label: 'Rotate', icon: <RotateCw /> },
    {
      action: 'screenOff',
      label: state.screenOff ? 'Turn phone screen on' : 'Turn phone screen off',
      icon: state.screenOff ? <Monitor /> : <MonitorOff />,
    },
    {
      action: 'record',
      label: recording ? 'Stop recording' : 'Record video',
      icon: recording ? <Square className="fill-current" /> : <Circle className="fill-destructive text-destructive" />,
    },
  ]

  return (
    <div
      className={cn(
        // @container: the toolbar adapts to its own width (window size, docked sidebar or not).
        '@container flex h-12 shrink-0 items-center gap-2 border-b px-3 transition-[padding] duration-200 [-webkit-app-region:drag] @3xl:gap-3',
        ownsCorner && 'pl-20',
      )}
    >
      <div className="flex min-w-0 shrink items-center gap-2">
        {ownsCorner && (
          <IconButton label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'} shortcut="⌘\" onClick={onToggleSidebar}>
            {sidebarOpen ? <PanelLeftClose /> : <PanelLeftOpen />}
          </IconButton>
        )}
        <span className="truncate font-semibold">
          {state.deviceName || (state.phase === 'connecting' ? 'Connecting…' : 'No device')}
        </span>
        {state.transport && (
          <Badge variant="outline" className="hidden gap-1 @xl:inline-flex">
            {state.transport.kind === 'usb' ? <Usb /> : <Wifi />}
            {state.transport.kind === 'usb' ? 'USB' : 'Wi-Fi'}
          </Badge>
        )}
      </div>

      {/* Priority tiers by toolbar width: navigation, unlock and screenshot always; the rest
          appears inline from @4xl / @5xl and otherwise lives in the More menu. */}
      <div className="ml-auto flex shrink-0 items-center gap-1.5 @3xl:gap-2">
        <div className={cn('flex items-center gap-1.5 @3xl:gap-2', !live && 'pointer-events-none opacity-40')}>
          <Group>
            <Action run={onAction} action="back" label="Back" hint="right-click">
              <ArrowLeft />
            </Action>
            <Action run={onAction} action="home" label="Home" hint="middle-click">
              <House />
            </Action>
            <Action run={onAction} action="recents" label="Recent apps">
              <SquareStack />
            </Action>
          </Group>
          <div className="hidden items-center gap-2 @4xl:flex">
            <Divider />
            <Group>
              <Action run={onAction} action="notifications" label="Notifications">
                <BellDot />
              </Action>
              <Action run={onAction} action="quickSettings" label="Quick settings">
                <Settings2 />
              </Action>
            </Group>
          </div>
          <Divider />
          <Group>
            <div className="hidden items-center gap-0.5 @5xl:flex">
              <Action run={onAction} action="volumeDown" label="Volume down">
                <Volume1 />
              </Action>
              <Action run={onAction} action="volumeUp" label="Volume up">
                <Volume2 />
              </Action>
              <Action run={onAction} action="power" label="Power">
                <Power />
              </Action>
            </div>
            <Action
              run={onAction}
              action="unlock"
              label="Unlock phone (types your PIN)"
              className={cn(state.locked && 'text-warning')}
            >
              {state.locked ? <LockKeyhole /> : <LockKeyholeOpen />}
            </Action>
            <div className="hidden items-center gap-0.5 @5xl:flex">
              <Action run={onAction} action="rotate" label="Rotate">
                <RotateCw />
              </Action>
              <Action
                run={onAction}
                action="screenOff"
                label={state.screenOff ? 'Turn phone screen on' : 'Turn phone screen off (keep mirroring)'}
              >
                {state.screenOff ? <Monitor /> : <MonitorOff />}
              </Action>
            </div>
          </Group>
          <Divider />
          <Group>
            {state.audio !== 'off' && (
              <IconButton label={state.muted ? 'Unmute' : 'Mute'} onClick={mirror.toggleMute}>
                {state.muted ? <VolumeX /> : <Volume2 />}
              </IconButton>
            )}
            <Action run={onAction} action="screenshot" label="Screenshot">
              <Camera />
            </Action>
            <div className="hidden @5xl:flex">
              <Action
                run={onAction}
                action="record"
                label={recording ? 'Stop recording' : 'Record video'}
                className={cn(recording && 'text-destructive')}
              >
                {recording ? <Square className="fill-current" /> : <Circle className="fill-destructive text-destructive" />}
              </Action>
            </div>
          </Group>
        </div>

        <NotificationCenter />
        {onCompact && (
          <IconButton label="Compact mirror" shortcut="⇧⌘M" onClick={onCompact}>
            <Smartphone />
          </IconButton>
        )}
        {/* Narrow toolbars: everything folded away is one click away here. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="More controls"
              className={cn('[-webkit-app-region:no-drag] @5xl:hidden', recording && 'text-destructive')}
            >
              <Ellipsis />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            {/* Rendered in a portal (outside the @container), so it always lists every secondary action. */}
            {more.map((m) => (
              <DropdownMenuItem key={m.action} disabled={!live} onSelect={() => onAction(m.action)}>
                {m.icon}
                {m.label}
                <DropdownMenuShortcut>{shortcutFor(m.action)}</DropdownMenuShortcut>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onShowHelp}>
              <Keyboard /> Controls & shortcuts
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="hidden items-center gap-2 @5xl:flex">
          <Divider />
          <IconButton label="Mouse, trackpad & keyboard controls" onClick={onShowHelp}>
            <Keyboard />
          </IconButton>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={state.phase === 'idle'}
          aria-label="Disconnect"
          className="text-destructive [-webkit-app-region:no-drag]"
          onClick={() => onAction('disconnect')}
        >
          <Unplug />
          <span className="hidden @3xl:inline">Disconnect</span>
        </Button>
      </div>
    </div>
  )
}
