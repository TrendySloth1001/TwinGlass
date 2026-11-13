// Records a test from what the user does on the mirror: taps and long presses become steps that name
// the element (read from the screen before the tap), typing becomes one "type" step per field, a
// burst of wheel ticks one scroll, and checks name an element that must be on screen. Steps keep
// the order they happened in even though naming an element is asynchronous.
import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { TestKey, TestStep } from '@shared/tests'
import type { InputRecorder } from '@/engine/input'
import type { Mirror } from '@/hooks/use-mirror'

export interface RecordingState {
  steps: TestStep[]
  checking: boolean
  model?: string
}

export interface TestRecorder {
  state: RecordingState | null
  start: () => Promise<void>
  stop: (name: string) => Promise<boolean>
  cancel: () => void
  toggleCheck: () => void
  /** Toolbar / menu keys (Back, Home, Recents) pressed while recording. */
  key: (k: TestKey) => void
}

export function useTestRecorder(mirror: Mirror, serial: string | null): TestRecorder {
  const [state, setState] = useState<RecordingState | null>(null)
  const steps = useRef<TestStep[]>([])
  const typed = useRef('')
  const queue = useRef<Promise<void>>(Promise.resolve())
  const lastScroll = useRef<{ dir: string; at: number } | null>(null)
  const snapTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const model = useRef<string | undefined>(undefined)
  const recorder = useRef<InputRecorder | null>(null)

  const publish = useCallback(() => {
    setState((s) => (s ? { ...s, steps: [...steps.current] } : s))
  }, [])

  /** Adds a step (or one still being worked out) after every step before it. */
  const push = useCallback(
    (step: TestStep | null | Promise<TestStep | null>) => {
      queue.current = queue.current.then(async () => {
        const s = await Promise.resolve(step).catch(() => null)
        if (s) {
          steps.current.push(s)
          publish()
        }
      })
    },
    [publish],
  )

  const flushText = useCallback(() => {
    if (!typed.current) return
    push({ action: 'type_text', text: typed.current })
    typed.current = ''
  }, [push])

  /** Re-read the screen once it has settled after an action (for naming the next tap). */
  const resnap = useCallback(() => {
    if (!serial) return
    if (snapTimer.current) clearTimeout(snapTimer.current)
    snapTimer.current = setTimeout(() => void window.mobMirror.tests.snapshot(serial).catch(() => {}), 900)
  }, [serial])

  const key = useCallback(
    (k: TestKey) => {
      if (!recorder.current) return
      if (k === 'delete' && typed.current) {
        typed.current = [...typed.current].slice(0, -1).join('')
        return
      }
      flushText()
      push({ action: 'press_key', key: k })
      resnap()
    },
    [flushText, push, resnap],
  )

  const start = useCallback(async () => {
    if (!serial || mirror.state.phase !== 'live') return void toast.error('Mirror a phone first, then record.')
    const begun = await window.mobMirror.tests.begin(serial).catch((e: unknown) => {
      toast.error('Couldn’t start recording', { description: e instanceof Error ? e.message : String(e) })
      return null
    })
    if (!begun) return
    steps.current = begun.first ? [begun.first] : []
    typed.current = ''
    model.current = begun.model
    const r: InputRecorder = {
      checking: false,
      gesture: (g) => {
        flushText()
        if (g.kind === 'swipe') push({ action: 'swipe', from: g.from, to: g.to, ms: Math.min(Math.max(g.ms, 100), 2000) })
        else push(window.mobMirror.tests.describeTap(serial, g.from, g.kind === 'long'))
        resnap()
      },
      check: (at) => {
        r.checking = false
        setState((s) => (s ? { ...s, checking: false } : s))
        push(
          window.mobMirror.tests.describeCheck(serial, at).then((s) => {
            if (!s) toast.info('Nothing with text or an id there to check. Try the text itself.')
            return s
          }),
        )
      },
      scroll: (dir) => {
        const now = Date.now()
        const last = lastScroll.current
        lastScroll.current = { dir, at: now }
        // One wheel gesture sends many ticks: record it once.
        if (last && last.dir === dir && now - last.at < 700) return
        flushText()
        push({ action: 'scroll', direction: dir })
        resnap()
      },
      text: (t) => {
        typed.current += t
      },
      key: (k) => key(k),
    }
    recorder.current = r
    mirror.setRecorder(r)
    setState({ steps: [...steps.current], checking: false, model: begun.model })
  }, [serial, mirror, flushText, push, resnap, key])

  const finish = useCallback(() => {
    recorder.current = null
    mirror.setRecorder(null)
    if (snapTimer.current) clearTimeout(snapTimer.current)
    setState(null)
  }, [mirror])

  const stop = useCallback(
    async (name: string) => {
      flushText()
      await queue.current
      if (!steps.current.length) {
        toast.error('Nothing was recorded.')
        return false
      }
      try {
        const saved = await window.mobMirror.tests.save({ name, createdAt: Date.now(), device: model.current, steps: steps.current })
        toast.success(`Saved “${saved.name}”`, { description: `${saved.steps.length} steps. Run it from the Tests view.` })
        finish()
        return true
      } catch (e) {
        toast.error('Couldn’t save the test', { description: e instanceof Error ? e.message : String(e) })
        return false
      }
    },
    [flushText, finish],
  )

  const toggleCheck = useCallback(() => {
    const r = recorder.current
    if (!r) return
    r.checking = !r.checking
    setState((s) => (s ? { ...s, checking: r.checking } : s))
  }, [])

  return { state, start, stop, cancel: finish, toggleCheck, key }
}
