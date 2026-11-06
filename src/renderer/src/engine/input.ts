// Mouse, trackpad and keyboard on the mirror canvas -> scrcpy control messages.
//
//   click / drag            one finger (taps, long-press, swipes, drag & drop on the phone)
//   ⌥ drag                  pinch / rotate around the screen centre (scrcpy's virtual finger)
//   ⌥⇧ drag                 two-finger vertical swipe (tilt)
//   trackpad pinch          pinch-zoom around the cursor (Chromium sends it as ctrl+wheel)
//   wheel / two-finger      scroll
//   right / middle click    Back / Home   (4th / 5th button: Recents / notifications)
//   typing                  text (ASCII as text, other characters via clipboard paste)
//   ⌘V / ⌘C / ⌘X            paste Mac clipboard into the phone / copy / cut on the phone
//   ⌘-shortcuts             handled by the app menu (src/shared/shortcuts.ts)
import { clientToVideo, clientToVideoClamped } from '@shared/input/coords'
import {
  initialPinchDistance,
  nextPinchDistance,
  pinchPair,
  virtualFinger,
  type MirrorMode,
  type Point,
} from '@shared/input/gestures'
import { AndroidKey, domCodeToKeycode, metaStateOf } from '@shared/input/keycodes'
import { CopyKey, KeyAction, MotionAction, MotionButton, PointerId } from '@shared/scrcpy/constants'
import {
  backOrScreenOn,
  expandNotificationPanel,
  getClipboard,
  injectKeycode,
  injectScroll,
  injectText,
  injectTouch,
  setClipboard,
  type Size,
} from '@shared/scrcpy/control'

/** Pixel delta that counts as one wheel "click". */
const WHEEL_PIXELS_PER_CLICK = 50
/** A trackpad pinch ends this long after the last ctrl+wheel event. */
const PINCH_IDLE_MS = 160
const PRINTABLE_ASCII = /^[\x20-\x7e]$/

interface Drag {
  pointerId: number
  /** Present while a second (virtual) finger is down. */
  mirror: MirrorMode | null
  last: Point
}

interface WheelPinch {
  center: Point
  distance: number
  timer: number
  fingers: [Point, Point]
}

/** Opt-in input trace for diagnosing control issues: localStorage['mob-mirror:debug-input'] = '1'. */
const TRACE = ((): boolean => {
  try {
    return localStorage.getItem('mob-mirror:debug-input') === '1'
  } catch {
    return false
  }
})()
const traceLog: string[] = []
if (TRACE) (window as unknown as { __mobMirrorInputLog: string[] }).__mobMirrorInputLog = traceLog
function trace(msg: string): void {
  if (!TRACE) return
  traceLog.push(`${performance.now().toFixed(0)} ${msg}`)
  if (traceLog.length > 200) traceLog.shift()
}

export class InputController {
  private drag: Drag | null = null
  private wheelPinch: WheelPinch | null = null
  private pressedKeys = new Set<string>()
  private clipboardSeq = 1n
  private readonly abort = new AbortController()

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly getSize: () => Size | null,
    private readonly send: (msg: Uint8Array) => void,
    /** Finger positions in video coordinates (empty = no finger down), for the touch overlay. */
    private readonly onFingers: (points: Point[], size: Size) => void = () => {},
  ) {
    const opts = { signal: this.abort.signal }
    canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e), opts)
    // pointermove is aligned to display frames (up to ~16 ms late); pointerrawupdate fires as soon
    // as the OS reports movement (verified available in Electron 45, secure context). Use it for
    // drags when present, so swipes reach the phone up to a frame earlier.
    const moveEvent = 'onpointerrawupdate' in window ? 'pointerrawupdate' : 'pointermove'
    canvas.addEventListener(moveEvent, (e) => this.onPointerMove(e as PointerEvent), opts)
    canvas.addEventListener('pointerup', (e) => this.onPointerUp(e), opts)
    canvas.addEventListener('pointercancel', (e) => this.onPointerUp(e), opts)
    canvas.addEventListener('lostpointercapture', () => this.endDrag(), opts)
    canvas.addEventListener('wheel', (e) => this.onWheel(e), { ...opts, passive: false })
    canvas.addEventListener('contextmenu', (e) => e.preventDefault(), opts)
    canvas.addEventListener('keydown', (e) => this.onKeyDown(e), opts)
    canvas.addEventListener('keyup', (e) => this.onKeyUp(e), opts)
    canvas.addEventListener('paste', (e) => this.onPaste(e), opts)
    canvas.addEventListener('copy', (e) => this.onCopy(e, CopyKey.COPY), opts)
    canvas.addEventListener('cut', (e) => this.onCopy(e, CopyKey.CUT), opts)
    canvas.addEventListener('blur', () => this.releaseAll(), opts)
  }

  pressKey(keycode: number): void {
    this.send(injectKeycode(KeyAction.DOWN, keycode))
    this.send(injectKeycode(KeyAction.UP, keycode))
  }

  // ---- touch ----

  private touch(action: number, pointerId: bigint, p: Point, size: Size, primary: boolean): void {
    const isMouse = pointerId === PointerId.MOUSE
    this.send(
      injectTouch({
        action,
        pointerId,
        position: { x: p.x, y: p.y, screen: size },
        pressure: action === MotionAction.UP ? 0 : 1,
        // Only the mouse pointer carries button state (scrcpy treats it as a finger unless
        // secondary buttons are pressed or it hovers).
        actionButton: isMouse && primary && action !== MotionAction.MOVE ? MotionButton.PRIMARY : 0,
        buttons: isMouse && action !== MotionAction.UP ? MotionButton.PRIMARY : 0,
      }),
    )
  }

  private fingers(drag: Drag, size: Size): Point[] {
    return drag.mirror ? [drag.last, virtualFinger(drag.last, size, drag.mirror)] : [drag.last]
  }

  private onPointerDown(e: PointerEvent): void {
    trace(`down id=${e.pointerId} btn=${e.button} type=${e.pointerType} at=${e.clientX},${e.clientY} drag=${this.drag ? this.drag.pointerId : '-'}`)
    this.canvas.focus()
    e.preventDefault()
    // Mouse buttons like scrcpy: right = Back, middle = Home, 4th = Recents, 5th = notifications.
    if (e.button === 2) return this.send(backOrScreenOn(KeyAction.DOWN))
    if (e.button === 1) return this.pressKey(AndroidKey.HOME)
    if (e.button === 3) return this.pressKey(AndroidKey.APP_SWITCH)
    if (e.button === 4) return this.send(expandNotificationPanel())
    if (e.button !== 0 || this.drag) return
    const size = this.getSize()
    if (!size) return
    const p = clientToVideo(e.clientX, e.clientY, this.canvas.getBoundingClientRect(), size)
    if (!p) return
    this.endWheelPinch()
    this.canvas.setPointerCapture(e.pointerId)
    const mirror: MirrorMode | null = e.altKey ? (e.shiftKey ? 'tilt' : 'pinch') : null
    const drag: Drag = { pointerId: e.pointerId, mirror, last: p }
    this.drag = drag
    this.touch(MotionAction.DOWN, PointerId.MOUSE, p, size, true)
    if (mirror) this.touch(MotionAction.DOWN, PointerId.VIRTUAL_FINGER, virtualFinger(p, size, mirror), size, false)
    this.onFingers(this.fingers(drag, size), size)
  }

  private onPointerMove(e: PointerEvent): void {
    const drag = this.drag
    if (!drag || e.pointerId !== drag.pointerId) return
    const size = this.getSize()
    if (!size) return
    const rect = this.canvas.getBoundingClientRect()
    // Coalesced events keep every intermediate position (smooth, precise swipes at 120 Hz+).
    const events = e.getCoalescedEvents?.() ?? []
    for (const ce of events.length ? events : [e]) {
      const p = clientToVideoClamped(ce.clientX, ce.clientY, rect, size)
      if (p.x === drag.last.x && p.y === drag.last.y) continue
      drag.last = p
      this.touch(MotionAction.MOVE, PointerId.MOUSE, p, size, true)
      if (drag.mirror) {
        this.touch(MotionAction.MOVE, PointerId.VIRTUAL_FINGER, virtualFinger(p, size, drag.mirror), size, false)
      }
    }
    this.onFingers(this.fingers(drag, size), size)
  }

  private onPointerUp(e: PointerEvent): void {
    trace(`${e.type} id=${e.pointerId} btn=${e.button} at=${e.clientX},${e.clientY} drag=${this.drag ? this.drag.pointerId : '-'}`)
    if (e.button === 2) return this.send(backOrScreenOn(KeyAction.UP))
    const drag = this.drag
    if (!drag || e.pointerId !== drag.pointerId) return
    const size = this.getSize()
    if (size) drag.last = clientToVideoClamped(e.clientX, e.clientY, this.canvas.getBoundingClientRect(), size)
    this.endDrag()
  }

  /** Lifts every finger of the current drag at its last position. */
  private endDrag(): void {
    const drag = this.drag
    trace(`endDrag ${drag ? `at ${drag.last.x},${drag.last.y}` : '(none)'}`)
    if (!drag) return
    this.drag = null
    const size = this.getSize()
    if (size) {
      if (drag.mirror) {
        this.touch(MotionAction.UP, PointerId.VIRTUAL_FINGER, virtualFinger(drag.last, size, drag.mirror), size, false)
      }
      this.touch(MotionAction.UP, PointerId.MOUSE, drag.last, size, true)
    }
    this.onFingers([], size ?? { width: 1, height: 1 })
  }

  // ---- wheel: scroll, or pinch when ctrl is set (trackpad pinch gesture) ----

  private onWheel(e: WheelEvent): void {
    e.preventDefault()
    const size = this.getSize()
    if (!size || this.drag) return
    const p = clientToVideoClamped(e.clientX, e.clientY, this.canvas.getBoundingClientRect(), size)
    if (e.ctrlKey) return this.pinchWheel(p, e.deltaY, size)
    const unit =
      e.deltaMode === WheelEvent.DOM_DELTA_LINE ? 3 : e.deltaMode === WheelEvent.DOM_DELTA_PAGE ? 0.1 : WHEEL_PIXELS_PER_CLICK
    const clamp = (v: number): number => Math.max(-16, Math.min(16, v))
    // scrcpy uses SDL's convention (+x right, +y up); DOM deltaY is positive when scrolling down.
    const h = clamp(e.deltaX / unit)
    const v = clamp(-e.deltaY / unit)
    if (h || v) this.send(injectScroll({ x: p.x, y: p.y, screen: size }, h, v))
  }

  private pinchWheel(cursor: Point, deltaY: number, size: Size): void {
    let wp = this.wheelPinch
    if (!wp) {
      const distance = initialPinchDistance(size)
      const fingers = pinchPair(cursor, distance, size)
      this.touch(MotionAction.DOWN, PointerId.GENERIC_FINGER, fingers[0], size, false)
      this.touch(MotionAction.DOWN, PointerId.VIRTUAL_FINGER, fingers[1], size, false)
      wp = { center: cursor, distance, timer: 0, fingers }
      this.wheelPinch = wp
    }
    wp.distance = nextPinchDistance(wp.distance, deltaY, size)
    wp.fingers = pinchPair(wp.center, wp.distance, size)
    this.touch(MotionAction.MOVE, PointerId.GENERIC_FINGER, wp.fingers[0], size, false)
    this.touch(MotionAction.MOVE, PointerId.VIRTUAL_FINGER, wp.fingers[1], size, false)
    this.onFingers(wp.fingers, size)
    clearTimeout(wp.timer)
    wp.timer = window.setTimeout(() => this.endWheelPinch(), PINCH_IDLE_MS)
  }

  private endWheelPinch(): void {
    const wp = this.wheelPinch
    if (!wp) return
    this.wheelPinch = null
    clearTimeout(wp.timer)
    const size = this.getSize()
    if (!size) return
    this.touch(MotionAction.UP, PointerId.VIRTUAL_FINGER, wp.fingers[1], size, false)
    this.touch(MotionAction.UP, PointerId.GENERIC_FINGER, wp.fingers[0], size, false)
    this.onFingers([], size)
  }

  // ---- keyboard ----

  private onKeyDown(e: KeyboardEvent): void {
    // ⌘ combinations belong to the app menu (Device shortcuts, and Edit → paste/copy/cut, which
    // arrive below as clipboard events). Don't swallow them.
    if (e.metaKey || e.isComposing) return
    e.preventDefault()
    // Printable characters go in as text, so they follow the Mac keyboard layout.
    if ([...e.key].length === 1 && !e.ctrlKey && !e.altKey) {
      if (PRINTABLE_ASCII.test(e.key)) this.send(injectText(e.key))
      else this.send(setClipboard(this.clipboardSeq++, e.key, true)) // non-ASCII: paste via clipboard
      return
    }
    const keycode = domCodeToKeycode(e.code)
    if (keycode === undefined) return
    this.pressedKeys.add(e.code)
    this.send(injectKeycode(KeyAction.DOWN, keycode, e.repeat ? 1 : 0, metaStateOf(e)))
  }

  private onKeyUp(e: KeyboardEvent): void {
    if (!this.pressedKeys.delete(e.code)) return
    const keycode = domCodeToKeycode(e.code)
    if (keycode !== undefined) this.send(injectKeycode(KeyAction.UP, keycode, 0, metaStateOf(e)))
  }

  // ---- clipboard (Edit menu roles dispatch these to the focused canvas) ----

  private onPaste(e: ClipboardEvent): void {
    e.preventDefault()
    const text = e.clipboardData?.getData('text/plain') ?? ''
    if (text) this.send(setClipboard(this.clipboardSeq++, text, true))
  }

  /** Asks the phone to copy/cut its selection; the phone's clipboard then syncs to the Mac. */
  private onCopy(e: ClipboardEvent, key: number): void {
    e.preventDefault()
    this.send(getClipboard(key))
  }

  /** Avoid stuck keys and stuck fingers when focus leaves the canvas. */
  private releaseAll(): void {
    for (const code of this.pressedKeys) {
      const keycode = domCodeToKeycode(code)
      if (keycode !== undefined) this.send(injectKeycode(KeyAction.UP, keycode))
    }
    this.pressedKeys.clear()
    this.endDrag()
    this.endWheelPinch()
  }

  dispose(): void {
    this.releaseAll()
    this.abort.abort()
  }
}
