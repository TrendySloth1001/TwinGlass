import { ChevronDown } from 'lucide-react'
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Text clamped to `lines` with an ellipsis; click to expand / collapse. A small chevron at the end
 * of the line is the only affordance, and it appears only when the text actually overflows.
 */
export function ExpandableText({
  text,
  lines = 1,
  className,
  defaultOpen = false,
}: {
  text: string
  lines?: 1 | 2 | 3
  className?: string
  /** Start expanded (e.g. the notice the user clicked in a toast). */
  defaultOpen?: boolean
}): ReactNode {
  const ref = useRef<HTMLParagraphElement>(null)
  const [open, setOpen] = useState(defaultOpen)
  const [overflows, setOverflows] = useState(defaultOpen)

  useLayoutEffect(() => {
    const el = ref.current
    if (el && !open) setOverflows(el.scrollHeight > el.clientHeight + 1)
  }, [text, open])

  const clamp = lines === 1 ? 'line-clamp-1' : lines === 2 ? 'line-clamp-2' : 'line-clamp-3'
  const toggle = (): void => setOpen((o) => !o)
  return (
    <div
      role={overflows ? 'button' : undefined}
      tabIndex={overflows ? 0 : undefined}
      aria-expanded={overflows ? open : undefined}
      title={overflows && !open ? 'Click to expand' : undefined}
      onClick={(e) => {
        if (!overflows) return
        e.stopPropagation() // don't trigger the toast/notice itself
        toggle()
      }}
      onKeyDown={(e) => {
        if (overflows && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          toggle()
        }
      }}
      className={cn('flex min-w-0 items-end gap-0.5', overflows && 'cursor-pointer', className)}
    >
      <p ref={ref} className={cn('min-w-0 flex-1 break-words', !open && clamp)}>
        {text}
      </p>
      {overflows && (
        <ChevronDown className={cn('mb-0.5 size-3 shrink-0 opacity-60 transition-transform', open && 'rotate-180')} />
      )}
    </div>
  )
}
