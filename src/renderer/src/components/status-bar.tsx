import { Circle, Cpu, Gauge, LoaderCircle, Music, Smartphone, Timer, Unplug, Usb, Wifi } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { AdbStatusInfo } from '../../../preload/api'
import type { MirrorState } from '@/hooks/use-mirror'
import { useVisibleInterval } from '@/hooks/use-visible-interval'
import { cn } from '@/lib/utils'

/** VS Code's status bar height. */
export const STATUS_BAR = 22

function Elapsed({ since }: { since: number }): ReactNode {
  const [now, setNow] = useState(Date.now())
  useVisibleInterval(() => setNow(Date.now()), 500) // only while someone can see it
  const s = Math.max(0, Math.floor((now - since) / 1000))
  return (
    <span className="tabular-nums">
      {Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}
    </span>
  )
}

const AUDIO_LABEL: Record<MirrorState['audio'], string> = {
  off: 'Audio off',
  waiting: 'Audio starting…',
  playing: 'Audio on',
  unavailable: 'Audio unavailable',
}

/** One status bar entry: small, with a hover highlight like VS Code's. */
function Item({ children, title, className, onClick }: { children: ReactNode; title?: string; className?: string; onClick?: () => void }): ReactNode {
  const cls = cn('flex h-full shrink-0 items-center gap-1 px-1.5 [&_svg]:size-3.5', onClick && 'hover:bg-foreground/10', className)
  return onClick ? (
    <button type="button" title={title} onClick={onClick} className={cls}>
      {children}
    </button>
  ) : (
    <span title={title} className={cls}>
      {children}
    </span>
  )
}

/**
 * The bottom bar. On the left, VS Code's remote indicator becomes the phone indicator (which phone,
 * over what); then the live stream's numbers. On the right, recording and adb.
 */
export function StatusBar({
  state,
  phones,
  adb,
  onRemote,
}: {
  state: MirrorState
  phones: number
  adb: AdbStatusInfo | null
  onRemote: () => void
}): ReactNode {
  const s = state.stats
  const live = state.phase === 'live'
  const busy = state.phase === 'connecting' || state.phase === 'reconnecting'
  const kind = state.transport?.kind
  const RemoteIcon = busy ? LoaderCircle : !state.transport ? Unplug : kind === 'usb' ? Usb : Wifi
  const remote = busy
    ? state.phase === 'connecting'
      ? 'Connecting…'
      : 'Reconnecting…'
    : state.transport
      ? `${state.deviceName || 'Phone'} · ${kind === 'usb' ? 'USB' : 'Wi-Fi'}`
      : 'No phone mirrored'
  return (
    <footer
      className="@container flex shrink-0 items-stretch overflow-hidden border-t border-border bg-statusbar pr-1 text-[12px] whitespace-nowrap text-statusbar-foreground tabular-nums"
      style={{ height: STATUS_BAR }}
    >
      <button
        type="button"
        onClick={onRemote}
        title="Phones"
        className="mr-1 flex items-center gap-1.5 bg-statusbar-remote px-2.5 text-white hover:brightness-110 [&_svg]:size-3.5"
      >
        <RemoteIcon className={cn(busy && 'animate-spin')} />
        {remote}
      </button>
      {!live && (
        <Item title="Phones connected" onClick={onRemote}>
          <Smartphone /> {phones} {phones === 1 ? 'phone' : 'phones'}
        </Item>
      )}
      {live && (
        <>
          <Item title="Resolution and frame rate">
            <Gauge /> {s ? `${s.width}×${s.height} · ${s.fps} fps` : '…'}
          </Item>
          <Item className="hidden @2xl:flex" title="Codec and decoder">
            <Cpu /> {s?.codec ?? '…'} · {s?.hardware ?? '…'}
          </Item>
          {s && (
            <Item
              className="hidden @md:flex"
              title={
                'Mac-side latency: packet received → frame on screen (IPC + decode + draw).\n' +
                `IPC ${s.latency.ipcMs.toFixed(1)} ms · decode ${s.latency.decodeMs.toFixed(1)} ms · decoder queue ${s.latency.queue}\n` +
                'Jitter: extra network/encoder delay vs the fastest recent frame (Wi-Fi stalls show up here).'
              }
            >
              <Timer /> {s.latency.appMs.toFixed(0)} ms · {s.latency.jitterMs.toFixed(0)} ms jitter
            </Item>
          )}
          <Item className="hidden @xl:flex">
            <Music /> {AUDIO_LABEL[state.audio]}
            {state.muted && ' (muted)'}
          </Item>
        </>
      )}
      <span className="ml-auto" />
      {state.recordingSince !== null && (
        <Item className="text-destructive">
          <Circle className="fill-current" /> REC <Elapsed since={state.recordingSince} />
        </Item>
      )}
      <Item className="hidden @lg:flex" title={adb?.adbPath ?? ''}>
        {adb?.adbPath ? `adb ${adb.clientVersion ?? ''}` : 'adb not found'}
      </Item>
    </footer>
  )
}
