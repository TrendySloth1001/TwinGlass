import { describe, expect, it } from 'vitest'
import { describeCheck, describeTap } from '../src/main/agent/recording'
import type { UiNode } from '../src/main/agent/ui-tree'
import { describeStep, isTestStep, testFileName } from '../src/shared/tests'

const node = (label: string, b: [number, number, number, number], o: Partial<UiNode> = {}): UiNode => ({
  label,
  kind: 'View',
  clickable: false,
  center: [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2],
  bounds: b,
  ...o,
})
const space = { width: 1000, height: 2000 }

describe('describeTap', () => {
  it('names the text under the tap, exactly', () => {
    const nodes = [node('', [0, 0, 1000, 2000]), node('Sign in', [100, 900, 900, 1000], { clickable: true, kind: 'Button', ref: '0.1' })]
    expect(describeTap(nodes, space, [0.5, 0.475])).toEqual({ action: 'tap_element', text: 'Sign in', exact: true, at: [0.5, 0.475] })
  })

  it('names the label inside a pressable row, and keeps long presses', () => {
    const row = node('', [0, 400, 1000, 600], { clickable: true, ref: '0.2' })
    const label = node('Wi-Fi', [50, 450, 300, 550], { ref: '0.2.0' })
    expect(describeTap([row, label], space, [0.1, 0.25], true)).toMatchObject({ action: 'tap_element', text: 'Wi-Fi', long: true })
  })

  it('uses the match index tap_element will use (pressable matches first)', () => {
    const nodes = [
      node('Add', [0, 100, 200, 200]), // a plain label "Add" (not pressable)
      node('Add', [0, 300, 200, 400], { clickable: true }),
      node('Add', [0, 500, 200, 600], { clickable: true }),
    ]
    // The second pressable "Add" → index 1 (pressable ones are tried first).
    expect(describeTap(nodes, space, [0.1, 0.275])).toMatchObject({ action: 'tap_element', text: 'Add', index: 1 })
  })

  it('falls back to an id when there is no text, and to a position when nothing can be named', () => {
    const icon = node('', [800, 50, 950, 150], { id: 'settings', clickable: true })
    expect(describeTap([icon], space, [0.875, 0.05])).toMatchObject({ action: 'tap_element', id: 'settings' })
    expect(describeTap([node('', [0, 0, 1000, 2000])], space, [0.3, 0.3])).toEqual({ action: 'tap', at: [0.3, 0.3] })
  })
})

describe('describeCheck', () => {
  it('checks the element under the pointer, or nothing', () => {
    const nodes = [node('Welcome back', [0, 100, 1000, 200])]
    expect(describeCheck(nodes, space, [0.5, 0.075])).toEqual({ action: 'wait_for', text: 'Welcome back', exact: true })
    expect(describeCheck(nodes, space, [0.5, 0.5])).toBeNull()
  })
})

describe('test files', () => {
  it('validates steps and describes them', () => {
    expect(isTestStep({ action: 'tap', at: [0.5, 0.5] })).toBe(true)
    expect(isTestStep({ action: 'tap', at: [2, 0.5] })).toBe(false)
    expect(isTestStep({ action: 'press_key', key: 'power' })).toBe(false)
    expect(describeStep({ action: 'tap_element', text: 'Sign in', index: 1 })).toBe('Press “Sign in” (match 2)')
    expect(describeStep({ action: 'swipe', from: [0.5, 0.8], to: [0.5, 0.2], ms: 300 })).toBe('Swipe up')
    expect(testFileName('  Login / flow: v2  ')).toBe('Login flow v2')
  })
})
