// App notifications: a compact one-line toast (sonner, shadcn-styled) plus an entry in the
// notification center. Toasts never expand in place (sonner measures their height once, so grown
// content spills out); clicking a toast's text opens the center with that notice expanded.
import { ChevronRight } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import { toast } from 'sonner'

export type NoticeLevel = 'info' | 'success' | 'warning' | 'error'

export interface NoticeAction {
  label: string
  run: () => void
}

export interface Notice {
  id: number
  level: NoticeLevel
  title: string
  description?: string
  action?: NoticeAction
  at: number
  read: boolean
}

interface State {
  notices: Notice[]
  /** Notification center popover open, and which notice to show expanded. */
  center: { open: boolean; focus: number | null }
}

let state: State = { notices: [], center: { open: false, focus: null } }
let nextId = 1
const listeners = new Set<() => void>()
function set(next: Partial<State>): void {
  state = { ...state, ...next }
  for (const l of listeners) l()
}

export function openNotificationCenter(focus: number | null = null): void {
  set({ center: { open: true, focus }, notices: state.notices.map((n) => ({ ...n, read: true })) })
}

export function setNotificationCenterOpen(open: boolean): void {
  set({ center: { open, focus: open ? state.center.focus : null } })
}

export type PopupPref = 'all' | 'errors' | 'off'
let popups: PopupPref = 'all'
/** Settings → General → Pop-up notifications. Notices always land in the notification center. */
export function setPopups(p: PopupPref): void {
  popups = p
}

/** Shows a compact toast and records the notice in the notification center (newest first, max 50). */
export function notify(level: NoticeLevel, title: string, opts: { description?: string; action?: NoticeAction } = {}): number {
  const n: Notice = { id: nextId++, level, title, ...opts, at: Date.now(), read: false }
  // Same notice again (e.g. a check that re-runs after a reload): refresh it, don't stack copies.
  const same = (m: Notice): boolean => m.level === level && m.title === title && m.description === opts.description
  set({ notices: [n, ...state.notices.filter((m) => !same(m))].slice(0, 50) })
  if (popups === 'off' || (popups === 'errors' && level !== 'error')) return n.id
  const toastId = `notice-${n.id}`
  const show = level === 'info' ? toast : toast[level]
  show(title, {
    id: toastId,
    description: opts.description ? (
      <button
        type="button"
        title="Show details"
        onClick={() => {
          toast.dismiss(toastId)
          openNotificationCenter(n.id)
        }}
        className="flex w-full min-w-0 items-center gap-0.5 text-left hover:text-foreground"
      >
        <span className="min-w-0 flex-1 truncate">{opts.description}</span>
        <ChevronRight className="size-3 shrink-0 opacity-60" />
      </button>
    ) : undefined,
    duration: level === 'error' || level === 'warning' ? 8000 : 4000,
    action: opts.action ? { label: opts.action.label, onClick: () => opts.action!.run() } : undefined,
  })
  return n.id
}

export function dismissNotice(id: number): void {
  set({ notices: state.notices.filter((n) => n.id !== id) })
}

export function clearNotices(): void {
  set({ notices: [] })
}

export function markAllRead(): void {
  if (!state.notices.some((n) => !n.read)) return
  set({ notices: state.notices.map((n) => ({ ...n, read: true })) })
}

function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useNotices(): Notice[] {
  return useSyncExternalStore(subscribe, () => state.notices)
}

export function useNotificationCenter(): State['center'] {
  return useSyncExternalStore(subscribe, () => state.center)
}
