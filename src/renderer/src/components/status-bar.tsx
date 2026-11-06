import { Circle, Cpu, Gauge, Music, Timer } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import type { MirrorState } from '@/hooks/use-mirror'

function Elapsed({ since }: { since: number }): ReactNode {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [])
  const s = Math.max(0, Math.floor((now - since) / 1000))
  return (
    <span className="tabular-nums">
      {Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}
    </span>
  )
}

const AUDIO_LABEL: Record<MirrorState['audio'], string> = {
  off: 'audio off',
  waiting: 'audio starting…',
  playing: 'audio on',
  unavailable: 'audio unavailable',
}

export function StatusBar({ state }: { state: MirrorState }): ReactNode {
  if (state.phase !== 'live') {
    return <footer className="h-7 shrink-0 border-t" />
  }
  const s = state.stats
  return (
    <footer className="flex h-7 shrink-0 items-center gap-4 border-t px-3 text-[11px] text-muted-foreground tabular-nums">
      <span className="flex items-center gap-1">
        <Gauge className="size-3" /> {s ? `${s.width}×${s.height} · ${s.fps} fps` : '…'}
      </span>
      <span className="flex items-center gap-1">
        <Cpu className="size-3" /> {s?.codec ?? '…'} · {s?.hardware ?? '…'} decode
      </span>
      {s && (
        <span
          className="flex items-center gap-1"
          title={
            'Mac-side latency: packet received → frame on screen (IPC + decode + draw).\n' +
            `IPC ${s.latency.ipcMs.toFixed(1)} ms · decode ${s.latency.decodeMs.toFixed(1)} ms · decoder queue ${s.latency.queue}\n` +
            'Jitter: extra network/encoder delay vs the fastest recent frame (Wi-Fi stalls show up here).'
          }
        >
          <Timer className="size-3" /> {s.latency.appMs.toFixed(0)} ms app · {s.latency.jitterMs.toFixed(0)} ms jitter
        </span>
      )}
      <span className="flex items-center gap-1">
        <Music className="size-3" /> {AUDIO_LABEL[state.audio]}
        {state.muted && ' (muted)'}
      </span>
      {state.recordingSince !== null && (
        <span className="ml-auto flex items-center gap-1 text-destructive">
          <Circle className="size-2.5 fill-current" /> REC <Elapsed since={state.recordingSince} />
        </span>
      )}
    </footer>
  )
}
