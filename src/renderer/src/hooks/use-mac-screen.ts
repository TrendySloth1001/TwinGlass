import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { MacScreenSender } from '@/engine/mac-screen-sender'
import { notify } from '@/lib/notify'

export interface MacScreenState {
  running: boolean
  starting: boolean
  viewers: number
  /** Capture on the Mac -> drawn on the phone, median over the last 2 s (ms), from the phone page. */
  latencyMs: number | null
  /** mirror: the Mac's main screen; extend: the phone is a second display. */
  mode: 'mirror' | 'extend'
}

/** "Show Mac screen on phone": capture + encode here, stream via main, view in the phone's Chrome. */
export function useMacScreen(): { state: MacScreenState; toggle: (mode?: 'mirror' | 'extend') => void; stop: () => void } {
  const [state, setState] = useState<MacScreenState>({ running: false, starting: false, viewers: 0, latencyMs: null, mode: 'mirror' })
  const sender = useRef<MacScreenSender | null>(null)

  const stop = useCallback(() => {
    sender.current?.stop()
    sender.current = null
    void window.mobMirror.macScreenStop()
    setState({ running: false, starting: false, viewers: 0, latencyMs: null, mode: 'mirror' })
  }, [])

  useEffect(
    () =>
      window.mobMirror.onMacScreen((ev) => {
        if (ev.t === 'keyframe') sender.current?.requestKeyFrame()
        else if (ev.t === 'viewers') setState((s) => ({ ...s, viewers: ev.n }))
        else if (ev.t === 'input-trusted' && !ev.ok)
          notify('warning', 'Allow touch control of the Mac', {
            description:
              'To click and scroll on the Mac from the phone, allow Electron (Mob Mirror while developing) under System Settings → Privacy & Security → Accessibility, then touch the phone again.',
            action: { label: 'Open Settings', run: () => void window.mobMirror.macScreenOpenPrivacy('accessibility') },
          })
        else if (ev.t === 'stats') setState((s) => ({ ...s, latencyMs: typeof ev.s.p50 === 'number' ? ev.s.p50 : null }))
        else if (ev.t === 'stop' && sender.current) {
          sender.current.stop()
          sender.current = null
          setState({ running: false, starting: false, viewers: 0, latencyMs: null, mode: 'mirror' })
        }
      }),
    [],
  )
  useEffect(() => () => sender.current?.stop(), [])
  // Diagnostics (latency tests from DevTools / CDP): encoder-side stats of the running share.
  useEffect(() => {
    ;(window as unknown as { __macScreenStats?: () => unknown }).__macScreenStats = () => sender.current?.stats() ?? null
  }, [])

  const start = useCallback(async (mode: 'mirror' | 'extend') => {
    setState((s) => ({ ...s, starting: true, mode }))
    try {
      // Always try: macOS reports "denied" for an app it never asked, and only the capture attempt
      // makes it show its prompt / list the app under Screen Recording. Failures are explained below.
      const s = new MacScreenSender(
        {
          config: (json) => window.mobMirror.macScreenConfig(json),
          chunk: (type, ts, data) => window.mobMirror.macScreenChunk(type, ts, data),
        },
        (reason) => {
          if (sender.current === s) {
            sender.current = null
            void window.mobMirror.macScreenStop()
            setState({ running: false, starting: false, viewers: 0, latencyMs: null, mode: 'mirror' })
            if (reason) toast(reason)
          }
        },
      )
      sender.current = s
      await window.mobMirror.macScreenStart(mode) // (extend: new display) + server + adb reverse + opens the page
      setState({ running: true, starting: false, viewers: 0, latencyMs: null, mode })
      toast.success(mode === 'extend' ? 'Your phone is now a second display' : 'Showing your Mac screen on the phone', {
        description:
          mode === 'extend'
            ? 'Move your pointer past the RIGHT edge of your screen to reach it, and drag windows there. You can move it in System Settings → Displays.'
            : 'Tap “Full screen” on the phone for the whole display.',
      })
      // Extend: send the phone's full resolution (the display is made exactly that size).
      await s.start(mode === 'extend' ? { width: 3200, height: 1600 } : undefined) // runs until stopped
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      sender.current?.stop()
      sender.current = null
      void window.mobMirror.macScreenStop()
      setState({ running: false, starting: false, viewers: 0, latencyMs: null, mode: 'mirror' })
      notify('error', 'Couldn’t show the Mac screen on the phone', {
        description: /SCREEN_PERMISSION|Permission|NotAllowed|denied/i.test(msg)
          ? 'macOS blocked screen capture. Allow Mob Mirror (Electron while developing) under System Settings → Privacy & Security → Screen Recording, then reopen the app.'
          : msg,
        action: /SCREEN_PERMISSION|Permission|NotAllowed|denied/i.test(msg) ? { label: 'Open Settings', run: () => void window.mobMirror.macScreenOpenPrivacy() } : undefined,
      })
    }
  }, [])

  const toggle = useCallback(
    (mode: 'mirror' | 'extend' = 'mirror') => {
      if (sender.current || state.running) stop()
      else if (!state.starting) void start(mode)
    },
    [start, stop, state.running, state.starting],
  )

  return { state, toggle, stop }
}
