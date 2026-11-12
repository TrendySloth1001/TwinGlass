// Motion building blocks in the spirit of Magic UI / Aceternity, written for this site.
// All of them calm down for people who asked their system for reduced motion.
import { AnimatePresence, motion, useInView, useMotionValue, useReducedMotion, useSpring } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'

/** Fades and un-blurs its children in when they scroll into view. */
export function BlurFade({ children, delay = 0, className, y = 12 }: { children: ReactNode; delay?: number; className?: string; y?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const seen = useInView(ref, { once: true, margin: '-60px' })
  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y, filter: 'blur(6px)' }}
      animate={seen ? { opacity: 1, y: 0, filter: 'blur(0px)' } : undefined}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}

/** Cycles through words in place. */
export function WordRotate({ words, className, every = 2200 }: { words: string[]; className?: string; every?: number }) {
  const [i, setI] = useState(0)
  const still = useReducedMotion()
  useEffect(() => {
    if (still) return
    const t = setInterval(() => setI((n) => (n + 1) % words.length), every)
    return () => clearInterval(t)
  }, [words.length, every, still])
  return (
    <span className={`relative inline-grid overflow-hidden align-bottom ${className ?? ''}`}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={words[i]}
          initial={{ y: '100%', opacity: 0, filter: 'blur(4px)' }}
          animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
          exit={{ y: '-100%', opacity: 0, filter: 'blur(4px)' }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="col-start-1 row-start-1 whitespace-nowrap"
        >
          {words[i]}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}

/** Counts up to `value` when it scrolls into view. */
export function NumberTicker({ value, decimals = 0, className }: { value: number; decimals?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const seen = useInView(ref, { once: true, margin: '-40px' })
  const mv = useMotionValue(0)
  const spring = useSpring(mv, { damping: 40, stiffness: 120 })
  useEffect(() => {
    if (seen) mv.set(value)
  }, [seen, value, mv])
  useEffect(
    () =>
      spring.on('change', (v) => {
        if (ref.current) ref.current.textContent = v.toFixed(decimals)
      }),
    [spring, decimals],
  )
  return (
    <span ref={ref} className={`tabular-nums ${className ?? ''}`}>
      {(0).toFixed(decimals)}
    </span>
  )
}

/** An endless row (CSS animation; pauses on hover). */
export function Marquee({ children, reverse = false, seconds = 40, className }: { children: ReactNode; reverse?: boolean; seconds?: number; className?: string }) {
  return (
    <div className={`group flex overflow-hidden [--gap:0.5rem] [gap:var(--gap)] mask-x-from-85% ${className ?? ''}`} style={{ ['--duration' as string]: `${seconds}s` }}>
      {[0, 1].map((k) => (
        <div
          key={k}
          aria-hidden={k === 1}
          className={`flex shrink-0 items-center [gap:var(--gap)] animate-[marquee_var(--duration)_linear_infinite] group-hover:[animation-play-state:paused] motion-reduce:animate-none ${reverse ? '[animation-direction:reverse]' : ''}`}
        >
          {children}
        </div>
      ))}
    </div>
  )
}

/**
 * A beam of light travelling along a curve between two elements (Magic UI's Animated Beam idea):
 * a faint track plus a short bright dash that runs along it.
 */
export function AnimatedBeam({
  container,
  from,
  to,
  curvature = 0,
  reverse = false,
  duration = 3.2,
  delay = 0,
}: {
  container: RefObject<HTMLElement | null>
  from: RefObject<HTMLElement | null>
  to: RefObject<HTMLElement | null>
  curvature?: number
  reverse?: boolean
  duration?: number
  delay?: number
}) {
  const [d, setD] = useState('')
  const [box, setBox] = useState({ w: 0, h: 0 })
  const id = useRef(`beam-${Math.random().toString(36).slice(2)}`).current
  // A plain effect: a child's layout effect runs before its parent's ref is attached.
  useEffect(() => {
    const update = () => {
      const c = container.current?.getBoundingClientRect()
      const a = from.current?.getBoundingClientRect()
      const b = to.current?.getBoundingClientRect()
      if (!c || !a || !b) return
      const x1 = a.left - c.left + a.width / 2
      const y1 = a.top - c.top + a.height / 2
      const x2 = b.left - c.left + b.width / 2
      const y2 = b.top - c.top + b.height / 2
      setBox({ w: c.width, h: c.height })
      setD(`M ${x1},${y1} Q ${(x1 + x2) / 2},${(y1 + y2) / 2 - curvature} ${x2},${y2}`)
    }
    update()
    const ro = new ResizeObserver(update)
    if (container.current) ro.observe(container.current)
    document.fonts?.ready.then(update).catch(() => {})
    return () => ro.disconnect()
  }, [container, from, to, curvature])
  return (
    <svg aria-hidden className="pointer-events-none absolute inset-0" width={box.w} height={box.h} viewBox={`0 0 ${box.w} ${box.h}`} fill="none">
      <defs>
        <linearGradient id={id} gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0078d4" stopOpacity="0" />
          <stop offset="50%" stopColor="#3794ff" />
          <stop offset="100%" stopColor="#4fc1ff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={d} stroke="currentColor" strokeOpacity="0.12" strokeWidth="2" strokeLinecap="round" />
      <path
        d={d}
        pathLength={1}
        stroke="#3794ff"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="0.18 0.82"
        className="animate-[beam_var(--beam-d)_linear_infinite] motion-reduce:hidden"
        style={{ ['--beam-d' as string]: `${duration}s`, animationDelay: `${delay}s`, animationDirection: reverse ? 'reverse' : 'normal' }}
      />
    </svg>
  )
}

/** A light that runs around a box's border (Magic UI's Border Beam idea). */
export function BorderBeam({ seconds = 8 }: { seconds?: number }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 rounded-[inherit] [mask:linear-gradient(#000,#000)_content-box_exclude,linear-gradient(#000,#000)] p-px motion-reduce:hidden"
    >
      <span
        className="absolute aspect-square w-40 animate-[border-beam_var(--bb)_linear_infinite] bg-[linear-gradient(to_left,#0078d4,#4fc1ff,transparent)] [offset-anchor:90%_50%] [offset-path:rect(0_auto_auto_0_round_0)]"
        style={{ ['--bb' as string]: `${seconds}s` }}
      />
    </span>
  )
}

/** A field of dots that fades out toward the edges. */
export function DotPattern({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 bg-[radial-gradient(circle,rgb(255_255_255/0.07)_1px,transparent_1.2px)] [background-size:18px_18px] ${className ?? ''}`}
    />
  )
}

/** A card that follows the pointer with a soft spotlight (Aceternity's card spotlight idea). */
export function SpotlightCard({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  return (
    <div
      ref={ref}
      onPointerMove={(e) => {
        const r = ref.current?.getBoundingClientRect()
        if (r) setPos({ x: e.clientX - r.left, y: e.clientY - r.top })
      }}
      onPointerLeave={() => setPos(null)}
      className={`group relative overflow-hidden ${className ?? ''}`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={pos ? { background: `radial-gradient(320px circle at ${pos.x}px ${pos.y}px, rgb(0 120 212 / 0.14), transparent 70%)` } : undefined}
      />
      {children}
    </div>
  )
}

/** Types a command out once it's on screen, then blinks a cursor. */
export function Typewriter({ text, className, speed = 22 }: { text: string; className?: string; speed?: number }) {
  const ref = useRef<HTMLPreElement>(null)
  const seen = useInView(ref, { once: true, margin: '-60px' })
  const still = useReducedMotion()
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!seen) return
    if (still) return void setN(text.length)
    const t = setInterval(() => setN((k) => (k >= text.length ? (clearInterval(t), k) : k + 1)), speed)
    return () => clearInterval(t)
  }, [seen, still, text, speed])
  return (
    <pre ref={ref} className={className}>
      {text.slice(0, n)}
      <span aria-hidden className="ml-px inline-block h-[1.1em] w-[0.55em] translate-y-[0.2em] animate-pulse bg-foreground/70" />
      <span className="sr-only">{text}</span>
    </pre>
  )
}
