import { describe, expect, it } from 'vitest'
import { ControlQueue, touchMovePointer } from '../src/shared/scrcpy/control-queue'
import { injectKeycode, injectTouch } from '../src/shared/scrcpy/control'
import { MotionAction } from '../src/shared/scrcpy/constants'
import { backoffDelay } from '../src/shared/util/backoff'
import { KeyedLimiter } from '../src/main/adb/limiter'
import { batchShellCommand, splitBatchOutput } from '../src/main/adb/parse'

const touch = (action: number, pointerId: bigint, x: number) =>
  injectTouch({
    action,
    pointerId,
    position: { x, y: 10, screen: { width: 100, height: 200 } },
    pressure: 1,
    actionButton: 0,
    buttons: 0,
  })
const xOf = (m: Uint8Array) => new DataView(m.buffer, m.byteOffset).getInt32(10)

describe('ControlQueue', () => {
  it('recognises only touch MOVE messages', () => {
    expect(touchMovePointer(touch(MotionAction.MOVE, 7n, 1))).toBe(7n)
    expect(touchMovePointer(touch(MotionAction.DOWN, 7n, 1))).toBeNull()
    expect(touchMovePointer(injectKeycode(0, 4))).toBeNull()
  })

  it('keeps only the latest MOVE per pointer, in place', () => {
    const q = new ControlQueue()
    q.push(touch(MotionAction.DOWN, 1n, 0))
    for (let x = 1; x <= 50; x++) q.push(touch(MotionAction.MOVE, 1n, x))
    q.push(touch(MotionAction.UP, 1n, 50))
    expect(q.length).toBe(3)
    expect(q.coalesced).toBe(49)
    const out = q.drain()!
    expect(out.length).toBe(96)
    expect(out[1]).toBe(MotionAction.DOWN)
    expect(out[33]).toBe(MotionAction.MOVE)
    expect(xOf(out.subarray(32, 64))).toBe(50)
    expect(out[65]).toBe(MotionAction.UP)
  })

  it('coalesces two pointers independently (pinch) and keeps their order', () => {
    const q = new ControlQueue()
    for (let x = 1; x <= 5; x++) {
      q.push(touch(MotionAction.MOVE, 1n, x))
      q.push(touch(MotionAction.MOVE, 2n, 100 - x))
    }
    expect(q.length).toBe(2)
    const out = q.drain()!
    expect(xOf(out.subarray(0, 32))).toBe(5)
    expect(xOf(out.subarray(32, 64))).toBe(95)
  })

  it('never lets a MOVE jump ahead of another message', () => {
    const q = new ControlQueue()
    q.push(touch(MotionAction.MOVE, 1n, 1))
    q.push(injectKeycode(0, 4))
    q.push(touch(MotionAction.MOVE, 1n, 2))
    q.push(touch(MotionAction.MOVE, 1n, 3))
    expect(q.length).toBe(3) // move(1), key, move(3)
    expect(q.drain()).not.toBeNull()
    expect(q.drain()).toBeNull()
  })
})

describe('backoffDelay', () => {
  it('grows exponentially, capped, with half fixed and half random', () => {
    expect(backoffDelay(0, 500, 4000, () => 0)).toBe(250)
    expect(backoffDelay(0, 500, 4000, () => 0.999)).toBe(500)
    expect(backoffDelay(2, 500, 4000, () => 0)).toBe(1000)
    expect(backoffDelay(10, 500, 4000, () => 0)).toBe(2000)
    expect(backoffDelay(10, 500, 4000, () => 0.999)).toBeLessThanOrEqual(4000)
  })
})

describe('KeyedLimiter', () => {
  it('caps concurrency per key, FIFO, and isolates keys', async () => {
    const lim = new KeyedLimiter(2)
    const order: number[] = []
    const gates: (() => void)[] = []
    const task = (n: number) => () =>
      new Promise<void>((resolve) => {
        order.push(n)
        gates[n] = resolve
      })
    const all = [0, 1, 2, 3].map((n) => lim.run('a', task(n)))
    const other = lim.run('b', async () => 'b')
    await Promise.resolve()
    expect(lim.active('a')).toBe(2)
    expect(await other).toBe('b')
    gates[0]!()
    await new Promise((r) => setTimeout(r, 0))
    expect(order).toEqual([0, 1, 2])
    gates[1]!()
    gates[2]!()
    await new Promise((r) => setTimeout(r, 0))
    gates[3]!()
    await Promise.all(all)
    expect(order).toEqual([0, 1, 2, 3])
    expect(lim.active('a')).toBe(0)
  })

  it('releases the slot when a task throws', async () => {
    const lim = new KeyedLimiter(1)
    await expect(lim.run('a', async () => Promise.reject(new Error('x')))).rejects.toThrow('x')
    expect(await lim.run('a', async () => 1)).toBe(1)
  })
})

describe('shell batching', () => {
  const M = '__MM_SPLIT_1234__'
  it('joins commands and splits their output', () => {
    expect(batchShellCommand(['a', 'b'], M)).toBe(`a ; echo ${M} ; b`)
    const out = `one\nline2\n${M}\ntwo\n${M}\nthree\n`
    expect(splitBatchOutput(out, M, 3)).toEqual(['one\nline2\n', 'two\n', 'three\n'])
  })
  it('pads missing parts (a command failed or the link dropped mid-way)', () => {
    expect(splitBatchOutput('only', M, 3)).toEqual(['only', '', ''])
  })
  it('handles CRLF output from old adb shells', () => {
    expect(splitBatchOutput(`a\r\n${M}\r\nb`, M, 2)).toEqual(['a\r\n', 'b'])
  })
})
