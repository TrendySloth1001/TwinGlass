import {
  ArrowLeft,
  BellDot,
  Camera,
  Circle,
  House,
  Keyboard,
  Monitor,
  MonitorOff,
  Power,
  RotateCw,
  Settings2,
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
  onShowHelp: () => void
}

export function MirrorToolbar({ mirror, onShowHelp }: ToolbarProps): ReactNode {
  const { state, runAction } = mirror
  const live = state.phase === 'live'
  const recording = state.recordingSince !== null

  return (
    <div className="flex h-12 shrink-0 items-center gap-3 border-b px-3 [-webkit-app-region:drag]">
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate font-semibold">
          {state.deviceName || (state.phase === 'connecting' ? 'Connecting…' : 'No device')}
        </span>
        {state.transport && (
          <Badge variant="outline" className="gap-1">
            {state.transport.kind === 'usb' ? <Usb /> : <Wifi />}
            {state.transport.kind === 'usb' ? 'USB' : 'Wi-Fi'}
          </Badge>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <div className={cn('flex items-center gap-2', !live && 'pointer-events-none opacity-40')}>
          <Group>
            <Action run={runAction} action="back" label="Back" hint="right-click">
              <ArrowLeft />
            </Action>
            <Action run={runAction} action="home" label="Home" hint="middle-click">
              <House />
            </Action>
            <Action run={runAction} action="recents" label="Recent apps">
              <SquareStack />
            </Action>
          </Group>
          <Divider />
          <Group>
            <Action run={runAction} action="notifications" label="Notifications">
              <BellDot />
            </Action>
            <Action run={runAction} action="quickSettings" label="Quick settings">
              <Settings2 />
            </Action>
          </Group>
          <Divider />
          <Group>
            <Action run={runAction} action="volumeDown" label="Volume down">
              <Volume1 />
            </Action>
            <Action run={runAction} action="volumeUp" label="Volume up">
              <Volume2 />
            </Action>
            <Action run={runAction} action="power" label="Power">
              <Power />
            </Action>
            <Action run={runAction} action="rotate" label="Rotate">
              <RotateCw />
            </Action>
            <Action run={runAction} action="screenOff" label={state.screenOff ? 'Turn phone screen on' : 'Turn phone screen off (keep mirroring)'}>
              {state.screenOff ? <Monitor /> : <MonitorOff />}
            </Action>
          </Group>
          <Divider />
          <Group>
            {state.audio !== 'off' && (
              <IconButton label={state.muted ? 'Unmute' : 'Mute'} onClick={mirror.toggleMute}>
                {state.muted ? <VolumeX /> : <Volume2 />}
              </IconButton>
            )}
            <Action run={runAction} action="screenshot" label="Screenshot">
              <Camera />
            </Action>
            <Action
              run={runAction}
              action="record"
              label={recording ? 'Stop recording' : 'Record video'}
              className={cn(recording && 'text-destructive')}
            >
              {recording ? <Square className="fill-current" /> : <Circle className="fill-destructive text-destructive" />}
            </Action>
          </Group>
        </div>
        <Divider />
        <IconButton label="Mouse, trackpad & keyboard controls" onClick={onShowHelp}>
          <Keyboard />
        </IconButton>
        <Button
          variant="outline"
          size="sm"
          disabled={!live}
          className="text-destructive [-webkit-app-region:no-drag]"
          onClick={() => runAction('disconnect')}
        >
          <Unplug /> Disconnect
        </Button>
      </div>
    </div>
  )
}
