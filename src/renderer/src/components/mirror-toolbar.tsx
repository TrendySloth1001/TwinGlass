import {
  ArrowLeft,
  BellDot,
  Camera,
  Circle,
  House,
  MonitorOff,
  Monitor,
  Power,
  RotateCw,
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
import { AndroidKey } from '@shared/input/keycodes'
import { expandNotificationPanel, rotateDevice } from '@shared/scrcpy/control'
import { IconButton } from '@/components/icon-button'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import type { Mirror } from '@/hooks/use-mirror'
import { cn } from '@/lib/utils'

function Group({ children }: { children: ReactNode }): ReactNode {
  return <div className="flex items-center gap-0.5">{children}</div>
}

export function MirrorToolbar({ mirror }: { mirror: Mirror }): ReactNode {
  const { state } = mirror
  const live = state.phase === 'live'
  const recording = state.recordingSince !== null

  return (
    <div className="flex h-12 shrink-0 items-center gap-3 border-b px-3 [-webkit-app-region:drag]">
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate font-semibold">{state.deviceName || (state.phase === 'connecting' ? 'Connecting…' : 'No device')}</span>
        {state.transport && (
          <Badge variant="outline" className="gap-1">
            {state.transport.kind === 'usb' ? <Usb /> : <Wifi />}
            {state.transport.kind === 'usb' ? 'USB' : 'Wi-Fi'}
          </Badge>
        )}
      </div>

      <div className={cn('ml-auto flex items-center gap-2', !live && 'pointer-events-none opacity-40')}>
        <Group>
          <IconButton label="Back" shortcut="Right-click" onClick={() => mirror.pressKey(AndroidKey.BACK)}>
            <ArrowLeft />
          </IconButton>
          <IconButton label="Home" shortcut="Middle-click" onClick={() => mirror.pressKey(AndroidKey.HOME)}>
            <House />
          </IconButton>
          <IconButton label="Recent apps" onClick={() => mirror.pressKey(AndroidKey.APP_SWITCH)}>
            <SquareStack />
          </IconButton>
        </Group>
        <Separator orientation="vertical" className="h-5!" />
        <Group>
          <IconButton label="Volume down" onClick={() => mirror.pressKey(AndroidKey.VOLUME_DOWN)}>
            <Volume1 />
          </IconButton>
          <IconButton label="Volume up" onClick={() => mirror.pressKey(AndroidKey.VOLUME_UP)}>
            <Volume2 />
          </IconButton>
          <IconButton label="Power" onClick={() => mirror.pressKey(AndroidKey.POWER)}>
            <Power />
          </IconButton>
        </Group>
        <Separator orientation="vertical" className="h-5!" />
        <Group>
          <IconButton label="Notifications" onClick={() => mirror.send(expandNotificationPanel())}>
            <BellDot />
          </IconButton>
          <IconButton label="Rotate" onClick={() => mirror.send(rotateDevice())}>
            <RotateCw />
          </IconButton>
          <IconButton
            label={state.screenOff ? 'Turn phone screen on' : 'Turn phone screen off (keep mirroring)'}
            onClick={mirror.toggleScreenOff}
          >
            {state.screenOff ? <Monitor /> : <MonitorOff />}
          </IconButton>
        </Group>
        <Separator orientation="vertical" className="h-5!" />
        <Group>
          {state.audio !== 'off' && (
            <IconButton label={state.muted ? 'Unmute' : 'Mute'} onClick={mirror.toggleMute}>
              {state.muted ? <VolumeX /> : <Volume2 />}
            </IconButton>
          )}
          <IconButton label="Screenshot" onClick={() => void mirror.screenshot()}>
            <Camera />
          </IconButton>
          <IconButton
            label={recording ? 'Stop recording' : 'Record video'}
            onClick={() => void mirror.toggleRecording()}
            className={cn(recording && 'text-destructive')}
          >
            {recording ? <Square className="fill-current" /> : <Circle className="fill-destructive text-destructive" />}
          </IconButton>
        </Group>
        <Button
          variant="outline"
          size="sm"
          className="text-destructive [-webkit-app-region:no-drag]"
          onClick={mirror.disconnect}
        >
          <Unplug /> Disconnect
        </Button>
      </div>
    </div>
  )
}
