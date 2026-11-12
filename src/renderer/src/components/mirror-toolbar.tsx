import {
  ArrowLeft,
  ChevronRight,
  BellDot,
  Camera,
  Circle,
  House,
  Ellipsis,
  Info,
  Keyboard,
  LockKeyhole,
  LockKeyholeOpen,
  Monitor,
  MonitorOff,
  Power,
  RotateCw,
  LayoutGrid,
  Layers,
  Search,
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
import { showPhoneDetails } from '@/lib/phone-details'
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
      size="icon-xs"
      className={cn('[&_svg]:size-4', className)}
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
  /** Switch to the compact phone-shaped mirror (only while mirroring). */
  onCompact?: () => void
  /** Normal windows: open a second screen (a whole phone) in a new window. */
  onSecondScreen?: () => void
  /** Second-screen windows: show that screen's app grid. */
  onOpenApps?: () => void
  onOpenSettings: () => void
  onOpenPalette: () => void
}

export function MirrorToolbar({ mirror, onAction, onShowHelp, onCompact, onOpenPalette, onSecondScreen, onOpenApps }: ToolbarProps): ReactNode {
  const { state } = mirror
  const live = state.phase === 'live'
  const idle = state.phase === 'idle'
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
        // VS Code's breadcrumbs row under the tab, with the phone's controls as editor actions.
        // @container: the row adapts to its own width (window size, side bar open or not).
        '@container flex h-[30px] shrink-0 items-center gap-2 border-b border-border bg-background pr-2 pl-3 text-[12px]',
      )}
    >
      <nav aria-label="Breadcrumbs" className="flex min-w-0 shrink items-center gap-0.5 text-muted-foreground">
        <span className="shrink-0">Phones</span>
        <ChevronRight className="size-3.5 shrink-0" />
        <span className="flex min-w-0 items-center gap-1 text-foreground">
          <Smartphone className="size-3.5 shrink-0 text-link" />
          <span className="truncate">{state.deviceName || (state.phase === 'connecting' ? 'Connecting…' : 'Phone')}</span>
        </span>
        {state.transport && (
          <span className="hidden items-center gap-0.5 @xl:flex">
            <ChevronRight className="size-3.5 shrink-0" />
            {state.transport.kind === 'usb' ? <Usb className="size-3.5" /> : <Wifi className="size-3.5" />}
            {state.transport.kind === 'usb' ? 'USB' : 'Wi-Fi'}
          </span>
        )}
      </nav>

      {/* Priority tiers by toolbar width: navigation, unlock and screenshot always; the rest
          appears inline from @4xl / @5xl and otherwise lives in the More menu. */}
      <div className="ml-auto flex shrink-0 items-center gap-1.5 @3xl:gap-2">
        {/* Nothing mirrored: no phone controls at all (the stage shows the connect screen). */}
        <div
          className={cn(
            'flex items-center gap-1.5 @3xl:gap-2',
            idle ? 'hidden' : !live && 'pointer-events-none opacity-40',
          )}
        >
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
              <IconButton size="icon-xs" className="[&_svg]:size-4" label={state.muted ? 'Unmute' : 'Mute'} onClick={mirror.toggleMute}>
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

        {!idle && (
          <IconButton label="Open app, send to phone, clipboard" shortcut="⌘K" size="icon-xs" className="[&_svg]:size-4" onClick={onOpenPalette}>
            <Search />
          </IconButton>
        )}
        {!idle && onOpenApps && (
          <IconButton size="icon-xs" className="[&_svg]:size-4" label="All apps on this screen" onClick={onOpenApps}>
            <LayoutGrid />
          </IconButton>
        )}
        {!idle && onSecondScreen && (
          <IconButton size="icon-xs" className="[&_svg]:size-4" label="Open a second screen (whole phone)" shortcut="⌥⌘N" onClick={onSecondScreen}>
            <Layers />
          </IconButton>
        )}
        {onCompact && (
          <IconButton size="icon-xs" className="[&_svg]:size-4" label="Compact mirror" shortcut="⇧⌘M" onClick={onCompact}>
            <Smartphone />
          </IconButton>
        )}
        {/* Narrow toolbars: everything folded away is one click away here. */}
        {!idle && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
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
            {state.transport && (
              <DropdownMenuItem onSelect={() => showPhoneDetails(state.transport!.serial, state.deviceName || 'Phone')}>
                <Info /> Phone details
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        )}
        <div className={cn('hidden items-center gap-2', !idle && '@5xl:flex')}>
          <Divider />
          <IconButton size="icon-xs" className="[&_svg]:size-4" label="Mouse, trackpad & keyboard controls" onClick={onShowHelp}>
            <Keyboard />
          </IconButton>
        </div>
        {!idle && (
        <Button
          variant="ghost"
          size="xs"
          aria-label="Disconnect"
          className="text-destructive hover:text-destructive [-webkit-app-region:no-drag] [&_svg]:size-3.5"
          onClick={() => onAction('disconnect')}
        >
          <Unplug />
          <span className="hidden @3xl:inline">Disconnect</span>
        </Button>
        )}
      </div>
    </div>
  )
}
