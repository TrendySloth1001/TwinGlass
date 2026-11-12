// Building blocks of the Settings pages (shared by settings-dialog and the About / What's new pages).
import type { ReactNode } from 'react'
import { SectionHeader } from '@/components/section-header'

/** One setting: label and explanation, the control beside it (or under it when narrow). */
export function Row({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }): ReactNode {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3">
      <div className="min-w-48 flex-1">
        <div className="text-[13px] font-medium">{label}</div>
        {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

export function Group({ title, children }: { title?: string; children: ReactNode }): ReactNode {
  return (
    <section className="mb-5">
      {title && <SectionHeader className="mb-2">{title}</SectionHeader>}
      <div className="divide-y rounded-xl border bg-card px-4">{children}</div>
    </section>
  )
}

