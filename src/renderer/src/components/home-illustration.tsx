import type { ReactNode } from 'react'

/** Shared screen content: the phone and its mirror on the laptop show the same thing. */
function PhoneScreen({ x, y, w, h }: { x: number; y: number; w: number; h: number }): ReactNode {
  const dot = w * 0.11
  return (
    <g strokeWidth={2.4}>
      <rect x={x + w * 0.16} y={y + h * 0.14} width={w * 0.68} height={h * 0.08} rx={h * 0.04} fill="currentColor" stroke="none" opacity={0.9} />
      <path d={`M${x + w * 0.16} ${y + h * 0.32} h${w * 0.56}`} />
      <path d={`M${x + w * 0.16} ${y + h * 0.4} h${w * 0.38}`} />
      {[0, 1, 2, 3].map((i) => (
        <circle key={i} cx={x + w * (0.22 + i * 0.19)} cy={y + h * 0.8} r={dot} />
      ))}
    </g>
  )
}

/**
 * Home screen illustration (original, hand-drawn style): a laptop mirroring the phone beside it,
 * joined by a cable, with a cursor tapping the mirrored screen. Ink = currentColor, paper = the
 * theme background, one accent colour, so it works in light and dark.
 */
export function HomeIllustration({ className }: { className?: string }): ReactNode {
  const paper = 'var(--background)'
  const accent = '#F2557A'
  return (
    <svg viewBox="0 0 470 390" className={className} fill="none" stroke="currentColor" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="A laptop mirroring the phone next to it">
      {/* ground */}
      <ellipse cx="225" cy="338" rx="205" ry="14" fill="currentColor" stroke="none" opacity={0.06} />

      {/* laptop screen (slightly irregular lines for a hand-drawn feel) */}
      <path d="M74 58 Q72 54 78 53 L318 50 Q325 50 325 56 L330 250 Q330 256 324 256 L70 259 Q64 259 64 253 Z" fill={paper} />
      <path d="M86 70 L311 67 L315 238 L84 241 Z" fill={paper} />
      {/* mirrored phone on the laptop */}
      <rect x="168" y="82" width="64" height="140" rx="11" fill={paper} />
      <PhoneScreen x={168} y={82} w={64} h={140} />
      {/* laptop base */}
      <path d="M58 262 L338 259 L376 300 Q380 306 372 307 L20 310 Q12 310 16 303 Z" fill={paper} />
      <path d="M168 288 L228 287" strokeWidth={2.6} />

      {/* cursor tapping the mirror */}
      <g transform="translate(226 150) rotate(-12)">
        <path d="M0 0 L0 34 L9 26 L15 39 L22 36 L16 23 L28 23 Z" fill={accent} strokeWidth={2.8} />
      </g>
      <path d="M214 140 l-7 -6 M222 134 l-1 -9 M231 139 l6 -6" strokeWidth={2.6} />

      {/* the real phone, standing beside the laptop */}
      <g transform="rotate(7 412 196)">
        <rect x="380" y="118" width="64" height="150" rx="13" fill={paper} />
        <circle cx="412" cy="129" r="2.6" fill="currentColor" stroke="none" />
        <PhoneScreen x={380} y={124} w={64} h={140} />
      </g>

      {/* cable: phone -> laptop */}
      <path d="M404 276 C 406 330, 340 342, 352 296" strokeWidth={2.8} />
      <rect x="345" y="282" width="14" height="12" rx="3" fill={paper} strokeWidth={2.6} transform="rotate(-8 352 288)" />

      {/* "same screen" motion arcs between phone and mirror */}
      <path d="M346 132 q 10 12 0 24 M358 124 q 16 20 0 40" strokeWidth={2.6} opacity={0.9} />

      {/* sparkles */}
      <path d="M392 52 v22 M381 63 h22" strokeWidth={2.8} />
      <path d="M40 112 v14 M33 119 h14" strokeWidth={2.4} opacity={0.7} />
      <circle cx="436" cy="88" r="3.4" fill={accent} stroke="none" />
    </svg>
  )
}
