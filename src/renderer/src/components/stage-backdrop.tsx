import type { CSSProperties, ReactNode } from 'react'

const WAVES = 6
const PERIOD_S = 9

/**
 * Home screen background, filling the whole stage: signal waves that travel outward from the
 * centre (a phone "being looked for"), a slow aurora glow and a faint dot grid. Sized in vmax so it
 * scales with the window; theme tokens only; still when the user prefers reduced motion.
 */
export function StageBackdrop(): ReactNode {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden select-none">
      {/* Aurora: two large blurred lights drifting slowly. */}
      <div
        className="mm-drift absolute top-1/2 left-1/2 size-[90vmax] rounded-full opacity-[0.16] blur-[90px] dark:opacity-[0.22]"
        style={{ background: 'radial-gradient(closest-side, var(--brand), transparent)', '--dx': '-18vmax', '--dy': '-10vmax' } as CSSProperties}
      />
      <div
        className="mm-drift absolute top-1/2 left-1/2 size-[70vmax] rounded-full opacity-[0.12] blur-[90px] [animation-delay:-11s] dark:opacity-[0.18]"
        style={{ background: 'radial-gradient(closest-side, oklch(0.7 0.17 300), transparent)', '--dx': '16vmax', '--dy': '12vmax' } as CSSProperties}
      />

      {/* Dot grid, fading out towards the edges. */}
      <div
        className="absolute inset-0 opacity-[0.5] [mask-image:radial-gradient(ellipse_at_center,black_10%,transparent_70%)] dark:opacity-[0.35]"
        style={{
          backgroundImage: 'radial-gradient(color-mix(in oklch, var(--foreground) 22%, transparent) 1px, transparent 1px)',
          backgroundSize: '22px 22px',
        }}
      />

      {/* Signal waves: rings growing from the centre to beyond the window, then fading. */}
      <div className="absolute inset-0 [mask-image:radial-gradient(circle_at_center,black_35%,transparent_75%)]">
        {Array.from({ length: WAVES }, (_, i) => (
          <div
            key={i}
            className="mm-wave absolute top-1/2 left-1/2 size-[150vmax] rounded-full border border-foreground/25"
            style={{ animationDelay: `${(-i * PERIOD_S) / WAVES}s`, animationDuration: `${PERIOD_S}s`, '--i': i } as CSSProperties}
          />
        ))}
        {/* A steady soft core behind the content. */}
        <div className="absolute top-1/2 left-1/2 size-[38vmax] -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/[0.03] ring-1 ring-foreground/10" />
      </div>
    </div>
  )
}
