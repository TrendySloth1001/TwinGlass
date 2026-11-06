// Mouse, wheel and keyboard on the canvas -> scrcpy control messages.
import { clientToVideo, clientToVideoClamped } from '@shared/input/coords'
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

/** Pixel delta that counts as one wheel "click". Tune on real trackpads and mice. */
const WHEEL_PIXELS_PER_CLICK = 50
const PRINTABLE_ASCII = /^[\x20-\x7e]$/

export class InputController {
  private dragging = false
  private pressedKeys = new Set<string>()
  private clipboardSeq = 1n
  private readonly abort = new AbortController()

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly getSize: () => Size | null,
    private readonly send: (msg: Uint8Array) => void,
    private readonly readClipboard: () => Promise<string>,
  ) {
    const opts = { signal: this.abort.signal }
    canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e), opts)
    canvas.addEventListener('pointermove', (e) => this.onPointerMove(e), opts)
    canvas.addEventListener('pointerup', (e) => this.onPointerUp(e), opts)
    canvas.addEventListener('pointercancel', (e) => this.onPointerUp(e), opts)
    canvas.addEventListener('wheel', (e) => this.onWheel(e), { ...opts, passive: false })
    canvas.addEventListener('contextmenu', (e) => e.preventDefault(), opts)
    canvas.addEventListener('keydown', (e) => void this.onKeyDown(e), opts)
    canvas.addEventListener('keyup', (e) => this.onKeyUp(e), opts)
    canvas.addEventListener('blur', () => this.releaseAll(), opts)
  }

  pressKey(keycode: number): void {
    this.send(injectKeycode(KeyAction.DOWN, keycode))
    this.send(injectKeycode(KeyAction.UP, keycode))
  }

  private lastTouch: { x: number; y: number } = { x: 0, y: 0 }

  private touch(action: number, x: number, y: number, size: Size, actionButton: number, buttons: number): void {
    this.lastTouch = { x, y }
    this.send(
      injectTouch({
        action,
        pointerId: PointerId.MOUSE,
        position: { x, y, screen: size },
        pressure: action === MotionAction.UP ? 0 : 1,
        actionButton,
        buttons,
      }),
    )
  }

  private onPointerDown(e: PointerEvent): void {
    this.canvas.focus()
    e.preventDefault()
    // Same mouse shortcuts as scrcpy: right = back, middle = home, 4th = recents, 5th = notifications.
    if (e.button === 2) return this.send(backOrScreenOn(KeyAction.DOWN))
    if (e.button === 1) return this.pressKey(AndroidKey.HOME)
    if (e.button === 3) return this.pressKey(AndroidKey.APP_SWITCH)
    if (e.button === 4) return this.send(expandNotificationPanel())
    if (e.button !== 0) return
    const size = this.getSize()
    if (!size) return
    const p = clientToVideo(e.clientX, e.clientY, this.canvas.getBoundingClientRect(), size)
    if (!p) return
    this.canvas.setPointerCapture(e.pointerId)
    this.dragging = true
    this.touch(MotionAction.DOWN, p.x, p.y, size, MotionButton.PRIMARY, MotionButton.PRIMARY)
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.dragging) return
    const size = this.getSize()
    if (!size) return
    // Coalesced events give smoother swipes at high polling rates.
    const events = e.getCoalescedEvents?.() ?? [e]
    const rect = this.canvas.getBoundingClientRect()
    for (const ce of events.length ? events : [e]) {
      const p = clientToVideoClamped(ce.clientX, ce.clientY, rect, size)
      this.touch(MotionAction.MOVE, p.x, p.y, size, 0, MotionButton.PRIMARY)
    }
  }

  private onPointerUp(e: PointerEvent): void {
    if (e.button === 2) return this.send(backOrScreenOn(KeyAction.UP))
    if (!this.dragging) return
    this.dragging = false
    const size = this.getSize()
    if (!size) return
    const p = clientToVideoClamped(e.clientX, e.clientY, this.canvas.getBoundingClientRect(), size)
    this.touch(MotionAction.UP, p.x, p.y, size, MotionButton.PRIMARY, 0)
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault()
    const size = this.getSize()
    if (!size) return
    const p = clientToVideoClamped(e.clientX, e.clientY, this.canvas.getBoundingClientRect(), size)
    const unit = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? 3 : e.deltaMode === WheelEvent.DOM_DELTA_PAGE ? 0.1 : WHEEL_PIXELS_PER_CLICK
    const clamp = (v: number): number => Math.max(-16, Math.min(16, v))
    // scrcpy uses SDL's convention (+x right, +y up); DOM deltaY is positive when scrolling down.
    const h = clamp(e.deltaX / unit)
    const v = clamp(-e.deltaY / unit)
    if (h || v) this.send(injectScroll({ x: p.x, y: p.y, screen: size }, h, v))
  }

  private async onKeyDown(e: KeyboardEvent): Promise<void> {
    if (e.isComposing) return
    if (e.metaKey) {
      // Cmd shortcuts: clipboard bridging. Leave the rest (Cmd+Q, Cmd+W...) to the app.
      if (e.code === 'KeyV') {
        e.preventDefault()
        const text = await this.readClipboard()
        if (text) this.send(setClipboard(this.clipboardSeq++, text, true))
      } else if (e.code === 'KeyC' || e.code === 'KeyX') {
        e.preventDefault()
        this.send(getClipboard(e.code === 'KeyC' ? CopyKey.COPY : CopyKey.CUT))
      }
      return
    }
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

  /** Avoid stuck keys and stuck touches when focus leaves the canvas. */
  private releaseAll(): void {
    for (const code of this.pressedKeys) {
      const keycode = domCodeToKeycode(code)
      if (keycode !== undefined) this.send(injectKeycode(KeyAction.UP, keycode))
    }
    this.pressedKeys.clear()
    const size = this.getSize()
    if (this.dragging && size) {
      this.touch(MotionAction.UP, this.lastTouch.x, this.lastTouch.y, size, MotionButton.PRIMARY, 0)
    }
    this.dragging = false
  }

  dispose(): void {
    this.releaseAll()
    this.abort.abort()
  }
}
