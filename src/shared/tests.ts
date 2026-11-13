// Recorded tests: what you did on the phone, saved as steps that find elements by what they say
// (not where they were), so a replay survives layout changes. Shared by the recorder (renderer), the
// runner (main) and the MCP tools. Positions are normalised to the screen (0..1) so they don't depend
// on the window or screenshot size; they are only a fallback when no element can be named.

export type NormPoint = [number, number]

export type TestKey = 'back' | 'home' | 'recents' | 'enter' | 'delete' | 'tab' | 'escape'

export type TestStep =
  /** Open the app the recording started in (always the first step). */
  | { action: 'launch_app'; package: string; label?: string }
  /** Press the element with this text or id; `at` is where it was, used only if it can't be found. */
  | { action: 'tap_element'; text?: string; id?: string; exact?: boolean; index?: number; long?: boolean; at?: NormPoint }
  /** A tap where no element could be named (an image, a canvas, a map). */
  | { action: 'tap'; at: NormPoint; long?: boolean }
  | { action: 'swipe'; from: NormPoint; to: NormPoint; ms: number }
  | { action: 'scroll'; direction: 'up' | 'down' | 'left' | 'right' }
  | { action: 'type_text'; text: string }
  | { action: 'press_key'; key: TestKey }
  /** A check: this element must be on screen (waits up to timeoutMs). */
  | { action: 'wait_for'; text?: string; id?: string; exact?: boolean; timeoutMs?: number }

export interface SavedTest {
  name: string
  createdAt: number
  /** The phone it was recorded on (model), for the list. */
  device?: string
  steps: TestStep[]
}

export interface StepResult {
  index: number
  ok: boolean
  message: string
  ms: number
}

export interface TestRunResult {
  name: string
  ok: boolean
  results: StepResult[]
  /** On failure: the screen at that moment (PNG data URL), when it could be captured. */
  screenshot?: string
}

/** One line for a step in lists and logs: “Press “Sign in””, “Type “hello””. */
export function describeStep(s: TestStep): string {
  const q = (t?: string, id?: string, i?: number): string => `${t ? `“${t}”` : id ? `#${id}` : 'element'}${i ? ` (match ${i + 1})` : ''}`
  switch (s.action) {
    case 'launch_app':
      return `Open ${s.label ?? s.package}`
    case 'tap_element':
      return `${s.long ? 'Long-press' : 'Press'} ${q(s.text, s.id, s.index)}`
    case 'tap':
      return `${s.long ? 'Long-press' : 'Tap'} at ${Math.round(s.at[0] * 100)}%, ${Math.round(s.at[1] * 100)}%`
    case 'swipe':
      return `Swipe ${dirOf(s.from, s.to)}`
    case 'scroll':
      return `Scroll ${s.direction}`
    case 'type_text':
      return `Type “${s.text.length > 40 ? `${s.text.slice(0, 40)}…` : s.text}”`
    case 'press_key':
      return `Press ${s.key[0]!.toUpperCase()}${s.key.slice(1)}`
    case 'wait_for':
      return `Check ${q(s.text, s.id)} is shown`
  }
}

function dirOf(a: NormPoint, b: NormPoint): string {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up'
}

/** A file-safe test name (also the file name). */
export function testFileName(name: string): string {
  const base = name
    .trim()
    .replace(/[^\w .-]+/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 80)
  return base || 'Untitled test'
}

/** Is this a well-formed step? (Saved files are user-editable JSON.) */
export function isTestStep(v: unknown): v is TestStep {
  if (!v || typeof v !== 'object') return false
  const s = v as Record<string, unknown>
  const pt = (p: unknown): boolean => Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === 'number' && n >= 0 && n <= 1)
  switch (s.action) {
    case 'launch_app':
      return typeof s.package === 'string' && /^[\w.]+$/.test(s.package)
    case 'tap_element':
      return (typeof s.text === 'string' || typeof s.id === 'string') && (s.at === undefined || pt(s.at))
    case 'tap':
      return pt(s.at)
    case 'swipe':
      return pt(s.from) && pt(s.to) && typeof s.ms === 'number'
    case 'scroll':
      return s.direction === 'up' || s.direction === 'down' || s.direction === 'left' || s.direction === 'right'
    case 'type_text':
      return typeof s.text === 'string'
    case 'press_key':
      return ['back', 'home', 'recents', 'enter', 'delete', 'tab', 'escape'].includes(s.key as string)
    case 'wait_for':
      return typeof s.text === 'string' || typeof s.id === 'string'
    default:
      return false
  }
}
