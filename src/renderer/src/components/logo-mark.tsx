// The Twinglass mark (same as site/src/components/logo.tsx) without its app-icon background: a laptop in the current text colour with a
// violet Android phone in front. A gap is cut out of the laptop around the phone (an SVG mask), so the
// two read apart on any background, light, dark or tinted, without painting a background colour.
import { useId } from 'react'

export function LogoMark({ className = 'size-6', title }: { className?: string; title?: string }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg viewBox="160 270 700 510" className={className} role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} fill="none">
      {title && <title>{title}</title>}
      <defs>
        <linearGradient id={`${id}p`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9B82FF" />
          <stop offset="1" stopColor="#5A35E6" />
        </linearGradient>
        <mask id={`${id}m`} maskUnits="userSpaceOnUse" x="160" y="270" width="700" height="510">
          <rect x="160" y="270" width="700" height="510" fill="#fff" />
          <rect x="608" y="348" width="264" height="438" rx="64" fill="#000" />
        </mask>
      </defs>
      {/* The Mac: screen of clear glass, notch, base. */}
      <g mask={`url(#${id}m)`}>
        <rect x="234" y="288" width="520" height="340" rx="34" fill="currentColor" fillOpacity=".1" stroke="currentColor" strokeWidth="32" />
        <path d="M454 288h80v16a12 12 0 0 1-12 12h-56a12 12 0 0 1-12-12z" fill="currentColor" />
        <path d="M188 646h612a10 10 0 0 1 10 10v2a26 26 0 0 1-26 26H204a26 26 0 0 1-26-26v-2a10 10 0 0 1 10-10z" fill="currentColor" />
      </g>
      {/* The Android phone in front. */}
      <rect x="634" y="374" width="212" height="386" rx="42" fill={`url(#${id}p)`} stroke="currentColor" strokeOpacity=".35" strokeWidth="10" />
      <circle cx="740" cy="410" r="12" fill="#fff" fillOpacity=".85" />
      <rect x="700" y="726" width="80" height="9" rx="4.5" fill="#fff" fillOpacity=".7" />
    </svg>
  )
}
