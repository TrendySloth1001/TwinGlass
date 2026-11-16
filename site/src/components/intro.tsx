// The opening: "Twinglass" is written by hand in one calm, steady stroke (each letter's time follows
// its real length, the next starting just before the last one ends), the ink settles in under a soft
// violet glow, then the word blurs away and the screen dissolves into the page. Once per visit
// (session), skipped for reduced motion; a click, key or scroll skips it.
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useState } from 'react'
import { HANDWRITING_LETTERS, HANDWRITING_VIEWBOX } from '../data/handwriting'

const KEY = 'twinglass:intro-seen'
/** A soft in-out curve: no snap at either end. */
const CALM = [0.45, 0, 0.35, 1] as const
const PEN_SECONDS = 2.2
const OVERLAP = 0.18
const total = HANDWRITING_LETTERS.reduce((n, l) => n + l.length, 0)

// Each letter's start and duration, at one steady pen speed.
const TIMING = (() => {
  let at = 0.25
  return HANDWRITING_LETTERS.map((l) => {
    const duration = 0.18 + (l.length / total) * PEN_SECONDS
    const t = { delay: at, duration }
    at += duration * (1 - OVERLAP)
    return t
  })
})()
const last = TIMING[TIMING.length - 1]!
/** When the last letter's ink has settled (seconds), then a short rest before opening. */
const WRITTEN = last.delay + last.duration + 0.5
const REST = 0.45

function seen(): boolean {
  try {
    return sessionStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function Intro() {
  const still = useReducedMotion()
  const [open, setOpen] = useState(() => !still && !seen())

  useEffect(() => {
    if (!open) return
    try {
      sessionStorage.setItem(KEY, '1')
    } catch {
      /* private mode: it just plays again */
    }
    const root = document.documentElement
    const before = root.style.overflow
    root.style.overflow = 'hidden'
    const done = (): void => setOpen(false)
    const timer = setTimeout(done, (WRITTEN + REST) * 1000)
    window.addEventListener('keydown', done)
    window.addEventListener('wheel', done, { passive: true })
    window.addEventListener('touchmove', done, { passive: true })
    return () => {
      clearTimeout(timer)
      root.style.overflow = before
      window.removeEventListener('keydown', done)
      window.removeEventListener('wheel', done)
      window.removeEventListener('touchmove', done)
    }
  }, [open])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="intro"
          aria-hidden
          onClick={() => setOpen(false)}
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.9, delay: 0.2, ease: CALM } }}
          className="fixed inset-0 z-[100] flex cursor-pointer items-center justify-center bg-background"
        >
          {/* A faint violet light that rises while the word is written. */}
          <motion.span
            className="pointer-events-none absolute size-[min(90vw,640px)] rounded-full bg-[radial-gradient(closest-side,rgb(124_92_255/0.16),transparent)]"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.6, ease: CALM } }}
            transition={{ duration: WRITTEN, ease: CALM }}
          />
          <motion.svg
            viewBox={HANDWRITING_VIEWBOX}
            className="relative w-[min(80vw,600px)] overflow-visible text-heading"
            initial={{ scale: 0.97 }}
            animate={{ scale: 1 }}
            transition={{ duration: WRITTEN + REST, ease: CALM }}
            exit={{ opacity: 0, scale: 1.03, filter: 'blur(10px)', transition: { duration: 0.7, ease: CALM } }}
          >
            {HANDWRITING_LETTERS.map((l, i) => (
              <motion.path
                key={i}
                d={l.d}
                pathLength={1}
                stroke="currentColor"
                strokeWidth={0.9}
                // Square ends: a round tip would leave a dot where a letter hasn't started yet.
                strokeLinecap="butt"
                strokeLinejoin="round"
                fill="currentColor"
                strokeDasharray="1 1"
                initial={{ strokeDashoffset: 1, fillOpacity: 0, strokeOpacity: 0 }}
                animate={{ strokeDashoffset: 0, fillOpacity: 1, strokeOpacity: 1 }}
                transition={{
                  strokeDashoffset: { delay: TIMING[i]!.delay, duration: TIMING[i]!.duration, ease: CALM },
                  // Nothing shows before the pen reaches the letter (no specks from zero-length strokes).
                  strokeOpacity: { delay: TIMING[i]!.delay, duration: 0.05 },
                  fillOpacity: { delay: TIMING[i]!.delay + TIMING[i]!.duration * 0.6, duration: 0.7, ease: CALM },
                }}
              />
            ))}
          </motion.svg>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
