// Owns one mirroring session: MessagePort, video decoder, audio player, input and recorder.
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { toast } from 'sonner'
import { QualityPreset, type AudioMode, type MainToRenderer, type RendererToMain } from '@shared/ipc'
import { AndroidKey } from '@shared/input/keycodes'
import { expandNotificationPanel, expandSettingsPanel, rotateDevice, setDisplayPower } from '@shared/scrcpy/control'
import type { DeviceAction } from '@shared/shortcuts'
import type { TransportInfo } from '../../../preload/api'
import { AudioPlayer } from '@/engine/audio-player'
import { InputController } from '@/engine/input'
import { Recorder } from '@/engine/recorder'
import { TouchOverlay } from '@/engine/touch-overlay'
import { VideoView, type VideoStats } from '@/engine/video-view'

export type Phase = 'idle' | 'connecting' | 'live'

export interface MirrorState {
  phase: Phase
  transport: TransportInfo | null
  deviceName: string
  stats: VideoStats | null
  audio: AudioPlayer['state'] | 'off'
  muted: boolean
  screenOff: boolean
  recordingSince: number | null
}

const IDLE: MirrorState = {
  phase: 'idle',
  transport: null,
  deviceName: '',
  stats: null,
  audio: 'off',
  muted: false,
  screenOff: false,
  recordingSince: null,
}

interface Engine {
  port: MessagePort
  video: VideoView
  input: InputController
  audio: AudioPlayer | null
  recorder: Recorder
  overlay: TouchOverlay | null
  timer: number
}

/** Waits for the session MessagePort forwarded by preload; `cancel` removes the listener. */
function waitForPort(): { promise: Promise<{ port: MessagePort; deviceName: string }>; cancel: () => void } {
  let onMessage: (e: MessageEvent) => void = () => {}
  const promise = new Promise<{ port: MessagePort; deviceName: string }>((resolve) => {
    onMessage = (e: MessageEvent): void => {
      if (e.source !== window || e.data?.type !== 'mob-mirror:session-port' || !e.ports[0]) return
      window.removeEventListener('message', onMessage)
      resolve({ port: e.ports[0], deviceName: e.data.deviceName as string })
    }
    window.addEventListener('message', onMessage)
  })
  return { promise, cancel: () => window.removeEventListener('message', onMessage) }
}

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e))

export interface ConnectOptions {
  audio: AudioMode
  showTouches: boolean
}

export interface Mirror {
  state: MirrorState
  connect: (t: TransportInfo, opts: ConnectOptions) => Promise<void>
  /** Runs a Device menu / toolbar action (no-op unless live). */
  runAction: (action: DeviceAction) => void
  disconnect: () => void
  send: (msg: Uint8Array) => void
  pressKey: (keycode: number) => void
  toggleScreenOff: () => void
  toggleMute: () => void
  screenshot: () => Promise<void>
  toggleRecording: () => Promise<void>
}

export function useMirror(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  overlayRef: RefObject<HTMLDivElement | null>,
): Mirror {
  const [state, setState] = useState<MirrorState>(IDLE)
  const engine = useRef<Engine | null>(null)
  const busy = useRef(false)
  const attempt = useRef(0)
  const patch = useCallback((p: Partial<MirrorState>) => setState((s) => ({ ...s, ...p })), [])

  const teardown = useCallback(
    (notifyMain: boolean) => {
      const e = engine.current
      if (!e) return
      engine.current = null
      clearInterval(e.timer)
      if (e.recorder.active) void e.recorder.stop()
      e.input.dispose()
      e.overlay?.dispose()
      e.video.dispose()
      e.audio?.dispose()
      if (notifyMain) e.port.postMessage({ t: 'stop' } satisfies RendererToMain)
      e.port.close()
      setState(IDLE)
    },
    [],
  )

  const send = useCallback((data: Uint8Array) => {
    engine.current?.port.postMessage({ t: 'control', data } satisfies RendererToMain)
  }, [])

  const connect = useCallback(
    async (t: TransportInfo, opts: ConnectOptions) => {
      const audioMode = opts.audio
      const canvas = canvasRef.current
      if (busy.current || !canvas) return
      busy.current = true
      teardown(true)
      // Disconnect (or unmount) while connecting bumps this; main also cancels its side.
      const gen = ++attempt.current
      setState({ ...IDLE, phase: 'connecting', transport: t })
      const wait = waitForPort()
      try {
        await window.mobMirror.startSession({
          serial: t.serial,
          audio: audioMode,
          showTouches: opts.showTouches,
          ...QualityPreset[t.kind],
        })
        const { port, deviceName } = await wait.promise
        if (gen !== attempt.current) {
          port.close()
          return
        }

        const video = new VideoView(canvas, (e) => toast.error(`Video: ${e.message}`), () => {})
        const audio = audioMode === 'off' ? null : new AudioPlayer((e) => toast.error(`Audio: ${e.message}`))
        const post = (data: Uint8Array): void => port.postMessage({ t: 'control', data } satisfies RendererToMain)
        const overlay = overlayRef.current ? new TouchOverlay(overlayRef.current, canvas) : null
        const input = new InputController(canvas, () => video.size, post, (points, size) =>
          points.length ? overlay?.show(points, size) : overlay?.clear(),
        )
        const recorder = new Recorder()

        port.onmessage = ({ data }: MessageEvent<MainToRenderer>) => {
          if (data.t === 'video') video.handle(data.ev, data.at)
          else if (data.t === 'audio') audio?.handle(data.ev)
          else if (data.t === 'log') console.debug('[scrcpy]', data.line.trimEnd())
          else if (data.t === 'closed') {
            teardown(false)
            if (data.error) toast.error('Disconnected', { description: data.error })
            else toast('Disconnected')
          }
        }
        port.start()

        const timer = window.setInterval(() => {
          patch({ stats: video.stats(), audio: audio ? audio.state : 'off' })
        }, 1000)

        engine.current = { port, video, input, audio, recorder, overlay, timer }
        setState({ ...IDLE, phase: 'live', transport: t, deviceName, audio: audio ? 'waiting' : 'off' })
        canvas.focus()
      } catch (e) {
        wait.cancel()
        if (gen !== attempt.current) return // cancelled by the user: not an error
        setState(IDLE)
        toast.error('Could not start mirroring', { description: errMsg(e) })
      } finally {
        busy.current = false
      }
    },
    [canvasRef, overlayRef, patch, teardown],
  )

  const disconnect = useCallback(() => {
    attempt.current++
    teardown(true)
    setState(IDLE) // also leaves the "connecting" phase, which teardown() doesn't cover
    void window.mobMirror.stopSession()
  }, [teardown])

  const pressKey = useCallback((keycode: number) => engine.current?.input.pressKey(keycode), [])

  // Side effects stay out of setState updaters (StrictMode runs updaters twice in development).
  const stateRef = useRef(state)
  stateRef.current = state

  const toggleScreenOff = useCallback(() => {
    const off = !stateRef.current.screenOff
    send(setDisplayPower(!off))
    patch({ screenOff: off })
  }, [patch, send])

  const toggleMute = useCallback(() => {
    const muted = !stateRef.current.muted
    if (engine.current?.audio) engine.current.audio.muted = muted
    patch({ muted })
  }, [patch])

  const screenshot = useCallback(async () => {
    const canvas = canvasRef.current
    if (!canvas || !engine.current) return
    try {
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'))
      if (!blob) throw new Error('nothing to capture yet')
      const path = await window.mobMirror.saveScreenshot(new Uint8Array(await blob.arrayBuffer()), state.deviceName)
      toast.success('Screenshot saved', {
        description: path,
        action: { label: 'Show in Finder', onClick: () => void window.mobMirror.reveal(path) },
      })
    } catch (e) {
      toast.error('Screenshot failed', { description: errMsg(e) })
    }
  }, [canvasRef, state.deviceName])

  const toggleRecording = useCallback(async () => {
    const e = engine.current
    const canvas = canvasRef.current
    if (!e || !canvas) return
    try {
      if (e.recorder.active) {
        patch({ recordingSince: null })
        const path = await e.recorder.stop()
        if (path) {
          toast.success('Recording saved', {
            description: path,
            action: { label: 'Show in Finder', onClick: () => void window.mobMirror.reveal(path) },
          })
        }
      } else {
        await e.recorder.start(canvas, e.audio?.stream ?? null, state.deviceName)
        patch({ recordingSince: Date.now() })
      }
    } catch (err) {
      patch({ recordingSince: null })
      toast.error('Recording failed', { description: errMsg(err) })
    }
  }, [canvasRef, patch, state.deviceName])

  useEffect(
    () => () => {
      attempt.current++
      teardown(true)
    },
    [teardown],
  )

  // Latest callbacks for runAction, so the menu subscription never sees stale closures.
  const actions = useRef({ disconnect, toggleScreenOff, screenshot, toggleRecording })
  actions.current = { disconnect, toggleScreenOff, screenshot, toggleRecording }

  const runAction = useCallback(
    (action: DeviceAction) => {
      if (!engine.current) return
      const a = actions.current
      const key = (k: number): void => engine.current?.input.pressKey(k)
      switch (action) {
        case 'back':
          return key(AndroidKey.BACK)
        case 'home':
          return key(AndroidKey.HOME)
        case 'recents':
          return key(AndroidKey.APP_SWITCH)
        case 'notifications':
          return send(expandNotificationPanel())
        case 'quickSettings':
          return send(expandSettingsPanel())
        case 'power':
          return key(AndroidKey.POWER)
        case 'volumeUp':
          return key(AndroidKey.VOLUME_UP)
        case 'volumeDown':
          return key(AndroidKey.VOLUME_DOWN)
        case 'rotate':
          return send(rotateDevice())
        case 'screenOff':
          return a.toggleScreenOff()
        case 'screenshot':
          return void a.screenshot()
        case 'record':
          return void a.toggleRecording()
        case 'disconnect':
          return a.disconnect()
      }
    },
    [send],
  )

  return {
    state,
    connect,
    runAction,
    disconnect,
    send,
    pressKey,
    toggleScreenOff,
    toggleMute,
    screenshot,
    toggleRecording,
  }
}
