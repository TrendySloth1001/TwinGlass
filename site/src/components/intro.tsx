// The opening: "Twinglass" writes itself by hand, letter by letter, the ink fills in, then the screen
// lifts away to show the page. Once per visit (session), skipped for reduced motion, and a click,
// key or scroll skips it.
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useState } from 'react'
import { HANDWRITING_LETTERS, HANDWRITING_VIEWBOX } from '../data/handwriting'

const KEY = 'twinglass:intro-seen'
const START = 0.15
const STEP = 0.13
const DRAW = 0.5
/** When the last letter's ink has filled in (seconds). */
const WRITTEN = START + (HANDWRITING_LETTERS.length - 1) * STEP + DRAW + 0.35
const HOLD = 0.35

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
    const timer = setTimeout(done, (WRITTEN + HOLD) * 1000)
    const skip = (): void => done()
    window.addEventListener('keydown', skip)
    window.addEventListener('wheel', skip, { passive: true })
    window.addEventListener('touchmove', skip, { passive: true })
    return () => {
      clearTimeout(timer)
      root.style.overflow = before
      window.removeEventListener('keydown', skip)
      window.removeEventListener('wheel', skip)
      window.removeEventListener('touchmove', skip)
    }
  }, [open])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="intro"
          aria-hidden
          onClick={() => setOpen(false)}
          initial={{ y: 0 }}
          exit={{ y: '-100%', transition: { duration: 0.7, ease: [0.7, 0, 0.2, 1] } }}
          className="fixed inset-0 z-[100] flex cursor-pointer items-center justify-center bg-background"
        >
          <motion.svg
            viewBox={HANDWRITING_VIEWBOX}
            className="w-[min(78vw,560px)] overflow-visible text-heading"
            exit={{ opacity: 0, y: -24, transition: { duration: 0.35 } }}
          >
            {HANDWRITING_LETTERS.map((d, i) => (
              <motion.path
                key={i}
                d={d}
                pathLength={1}
                stroke="currentColor"
                strokeWidth={1.4}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="currentColor"
                strokeDasharray="1 1"
                initial={{ strokeDashoffset: 1, fillOpacity: 0 }}
                animate={{ strokeDashoffset: 0, fillOpacity: 1 }}
                transition={{
                  strokeDashoffset: { delay: START + i * STEP, duration: DRAW, ease: 'easeInOut' },
                  fillOpacity: { delay: START + i * STEP + DRAW * 0.8, duration: 0.35 },
                }}
              />
            ))}
          </motion.svg>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
