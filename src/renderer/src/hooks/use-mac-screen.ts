import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { MacScreenSender } from '@/engine/mac-screen-sender'
import { notify } from '@/lib/notify'

export interface MacScreenState {
  running: boolean
  starting: boolean
  viewers: number
}

/** "Show Mac screen on phone": capture + encode here, stream via main, view in the phone's Chrome. */
export function useMacScreen(): { state: MacScreenState; toggle: () => void; stop: () => void } {
  const [state, setState] = useState<MacScreenState>({ running: false, starting: false, viewers: 0 })
  const sender = useRef<MacScreenSender | null>(null)

  const stop = useCallback(() => {
    sender.current?.stop()
    sender.current = null
    void window.mobMirror.macScreenStop()
    setState({ running: false, starting: false, viewers: 0 })
  }, [])

  useEffect(
    () =>
      window.mobMirror.onMacScreen((ev) => {
        if (ev.t === 'keyframe') sender.current?.requestKeyFrame()
        else if (ev.t === 'viewers') setState((s) => ({ ...s, viewers: ev.n }))
        else if (ev.t === 'stop' && sender.current) {
          sender.current.stop()
          sender.current = null
          setState({ running: false, starting: false, viewers: 0 })
        }
      }),
    [],
  )
  useEffect(() => () => sender.current?.stop(), [])

  const start = useCallback(async () => {
    setState((s) => ({ ...s, starting: true }))
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
            setState({ running: false, starting: false, viewers: 0 })
            if (reason) toast(reason)
          }
        },
      )
      sender.current = s
      await window.mobMirror.macScreenStart() // server + adb reverse + opens the page on the phone
      setState({ running: true, starting: false, viewers: 0 })
      toast.success('Showing your Mac screen on the phone', { description: 'Tap “Full screen” on the phone for the whole display.' })
      await s.start() // runs until stopped
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      sender.current?.stop()
      sender.current = null
      void window.mobMirror.macScreenStop()
      setState({ running: false, starting: false, viewers: 0 })
      notify('error', 'Couldn’t show the Mac screen on the phone', {
        description: /SCREEN_PERMISSION|Permission|NotAllowed|denied/i.test(msg)
          ? 'macOS blocked screen capture. Allow Mob Mirror (Electron while developing) under System Settings → Privacy & Security → Screen Recording, then reopen the app.'
          : msg,
        action: /SCREEN_PERMISSION|Permission|NotAllowed|denied/i.test(msg) ? { label: 'Open Settings', run: () => void window.mobMirror.macScreenOpenPrivacy() } : undefined,
      })
    }
  }, [])

  const toggle = useCallback(() => {
    if (sender.current || state.running) stop()
    else if (!state.starting) void start()
  }, [start, stop, state.running, state.starting])

  return { state, toggle, stop }
}
