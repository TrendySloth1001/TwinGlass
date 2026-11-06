import type { CSSProperties, ReactNode } from 'react'

/** Small hand-drawn doodles (ink = currentColor) scattered faintly behind the home screen. */
const DOODLES: { d: string; x: string; y: string; size: number; rot: number }[] = [
  // question-ish squiggle, cursor, wifi, sparkle, plug, keycap
  { d: 'M8 9 q0 -6 6 -6 q6 0 6 6 q0 4 -6 6 v4 M14 24 v.5', x: '46%', y: '16%', size: 30, rot: -8 },
  { d: 'M4 3 L4 23 L9 18 L13 26 L17 24 L13 16 L20 16 Z', x: '12%', y: '70%', size: 28, rot: 10 },
  { d: 'M4 12 q10 -9 20 0 M8 16 q6 -5 12 0 M13 21 h2', x: '86%', y: '22%', size: 32, rot: 6 },
  { d: 'M14 3 v22 M3 14 h22 M7 7 l14 14 M21 7 L7 21', x: '6%', y: '24%', size: 22, rot: 0 },
  { d: 'M9 4 v6 M17 4 v6 M6 10 h14 v5 a7 7 0 0 1 -14 0 z M13 22 v4', x: '52%', y: '82%', size: 30, rot: -14 },
  { d: 'M5 5 h18 v18 h-18 z M10 15 h8', x: '90%', y: '76%', size: 26, rot: 12 },
]

/**
 * Home screen background, kept simple: plain paper with a few faint doodles that float gently.
 * Theme ink only; still when the user prefers reduced motion.
 */
export function StageBackdrop(): ReactNode {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden text-foreground/15 select-none">
      {DOODLES.map((g, i) => (
        <svg
          key={i}
          viewBox="0 0 28 28"
          width={g.size}
          height={g.size}
          className="mm-float absolute"
          style={{ left: g.x, top: g.y, '--r': `${g.rot}deg`, animationDelay: `${-i * 1.7}s` } as CSSProperties}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d={g.d} />
        </svg>
      ))}
    </div>
  )
}
