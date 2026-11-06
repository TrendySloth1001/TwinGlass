// Outgoing control messages while the control socket is backed up (a Wi-Fi stall).
//
// Design follows scrcpy's own controller (app/src/controller.c): when its queue fills, droppable
// messages are dropped, everything else is kept. Here the only "droppable" kind is a touch MOVE
// that a newer MOVE of the same pointer supersedes: replaying stale drag positions after a stall
// only makes the phone lag behind the cursor. DOWN/UP, keys, text, scroll and clipboard are never
// dropped or reordered.
import { ControlType, MotionAction } from './constants'

/** Pointer id of an INJECT_TOUCH_EVENT MOVE (32-byte message), else null. */
export function touchMovePointer(msg: Uint8Array): bigint | null {
  if (msg.length !== 32 || msg[0] !== ControlType.INJECT_TOUCH_EVENT || msg[1] !== MotionAction.MOVE) return null
  return new DataView(msg.buffer, msg.byteOffset, msg.byteLength).getBigInt64(2)
}

export class ControlQueue {
  private queue: Uint8Array[] = []
  /** pointer id -> index of its latest MOVE that nothing has been queued behind yet. */
  private replaceable = new Map<bigint, number>()
  /** MOVEs superseded so far (diagnostics). */
  coalesced = 0

  get length(): number {
    return this.queue.length
  }

  push(msg: Uint8Array): void {
    const pointer = touchMovePointer(msg)
    if (pointer !== null) {
      const i = this.replaceable.get(pointer)
      if (i !== undefined) {
        this.queue[i] = msg // newer position replaces the stale one, at the same place in order
        this.coalesced++
        return
      }
      this.replaceable.set(pointer, this.queue.length)
      this.queue.push(msg)
      return
    }
    // Anything else is a barrier: a later MOVE must never jump ahead of it.
    this.replaceable.clear()
    this.queue.push(msg)
  }

  /** Everything queued, in order, as one buffer (one socket write). */
  drain(): Uint8Array | null {
    if (!this.queue.length) return null
    const total = this.queue.reduce((n, m) => n + m.length, 0)
    const out = new Uint8Array(total)
    let o = 0
    for (const m of this.queue) {
      out.set(m, o)
      o += m.length
    }
    this.queue = []
    this.replaceable.clear()
    return out
  }
}
