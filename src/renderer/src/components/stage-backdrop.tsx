import type { CSSProperties, ReactNode } from 'react'

const WAVES = 4
const PERIOD_S = 12

/**
 * Home screen background, kept simple: a soft glow in the centre and a few faint rings drifting
 * slowly outward across the whole window. Theme tokens only; still with Reduce motion.
 */
export function StageBackdrop(): ReactNode {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden select-none">
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse at center, color-mix(in oklch, var(--foreground) 5%, transparent), transparent 65%)' }}
      />
      <div className="absolute inset-0 [mask-image:radial-gradient(circle_at_center,black_30%,transparent_72%)]">
        {Array.from({ length: WAVES }, (_, i) => (
          <div
            key={i}
            className="mm-wave absolute top-1/2 left-1/2 size-[140vmax] rounded-full border border-foreground/15"
            style={{ animationDelay: `${(-i * PERIOD_S) / WAVES}s`, animationDuration: `${PERIOD_S}s`, '--i': i } as CSSProperties}
          />
        ))}
      </div>
    </div>
  )
}
