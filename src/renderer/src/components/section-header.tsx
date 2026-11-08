import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Section caption: Space Mono caps followed by a hairline (Sparky's SectionHeader). */
export function SectionHeader({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }): ReactNode {
  return (
    <div className={cn('mb-3 flex items-center gap-3', className)}>
      <h3 className="label-mono shrink-0 text-faint">{children}</h3>
      <div className="h-px flex-1 bg-border" />
      {action}
    </div>
  )
}
