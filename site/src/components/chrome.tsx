// The site header: a floating bar at the top that becomes a corner icon once you scroll.
import { ArrowUp, Download, Menu, Moon, Sun, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { FrameCorners, GithubMark, REPO } from './base'
import { LogoMark } from './logo'
import { useDownload } from './download'

function go(hash: string) {
  if (window.location.pathname !== '/') window.location.href = `/${hash}`
  else document.querySelector(hash)?.scrollIntoView({ behavior: 'smooth' })
}

/** Light / dark: starts from the system setting; a click picks one and remembers it on this device. */
function ThemeToggle() {
  const systemDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches
  const current = () => (document.documentElement.dataset.theme as 'light' | 'dark' | undefined) ?? (systemDark() ? 'dark' : 'light')
  const [theme, setTheme] = useState<'light' | 'dark'>(current)
  useEffect(() => {
    const q = window.matchMedia('(prefers-color-scheme: dark)')
    const on = () => setTheme(current())
    q.addEventListener('change', on)
    return () => q.removeEventListener('change', on)
  }, [])
  const flip = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    try {
      localStorage.setItem('twinglass:theme', next)
    } catch {
      /* private mode: just this visit */
    }
    setTheme(next)
  }
  return (
    <button
      type="button"
      onClick={flip}
      aria-label={theme === 'dark' ? 'Switch to the light theme' : 'Switch to the dark theme'}
      title={theme === 'dark' ? 'Light theme' : 'Dark theme'}
      className="flex size-9 items-center justify-center rounded-[4px] text-muted-foreground transition-colors hover:text-heading"
    >
      {theme === 'dark' ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
    </button>
  )
}

/** Height the corner card grows by on hover: four 36px icons, 4px gaps, 10px top and 4px bottom padding. */
const RAIL = 4 * 36 + 3 * 4 + 10 + 4

/** Where the card sits in each state, in px (real size changes, never a scale, so nothing inside stretches). */
function useGeometry() {
  const calc = () => {
    const vw = document.documentElement.clientWidth
    const vh = window.innerHeight
    const pad = vw >= 1024 ? 40 : vw >= 640 ? 24 : 12
    const edge = vw >= 640 ? 24 : 16
    const top = vw >= 640 ? 16 : 12
    const width = Math.min(1152, vw - pad * 2)
    return {
      bar: { top, left: (vw - width) / 2, width, height: 56 },
      dot: { top: vh - 56 - edge, left: vw - 56 - edge, width: 56, height: 56 },
      rail: { top: vh - 56 - RAIL - edge, left: vw - 56 - edge, width: 56, height: 56 + RAIL },
      edge,
      barRight: (vw - width) / 2,
    }
  }
  const [g, setG] = useState(calc)
  useEffect(() => {
    const on = () => setG(calc())
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return g
}

/**
 * The app bar. At the top of the page it's a floating framed bar; once you scroll, the same card
 * shrinks into the bottom-right corner as just the Twinglass icon, and grows back into the bar when
 * you return to the top. Hovering the corner icon grows the card upward into a few quick actions;
 * a click keeps them open. On small screens the bar's menu button opens the full menu.
 */
export function SiteHeader() {
  const { openDownload } = useDownload()
  const [scrolled, setScrolled] = useState(false)
  // open: the mobile menu at the top, or the corner card pinned open by a click.
  const [open, setOpen] = useState(false)
  const [hover, setHover] = useState(false)
  const expanded = scrolled && (open || hover)
  const root = useRef<HTMLDivElement>(null)
  const g = useGeometry()
  const links = [
    ['Features', '#features'],
    ['Phone app', '#phone'],
    ['Agents', '#agents'],
    ['FAQ', '#faq'],
  ]
  const pages = [
    ['Tools', '/tools'],
    ['Changelog', '/changelog'],
    ['Releases', '/releases'],
  ]
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 120)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  useEffect(() => {
    setOpen(false)
    setHover(false)
  }, [scrolled])
  useEffect(() => {
    if (!open) return
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const click = (e: MouseEvent) => root.current && !root.current.contains(e.target as Node) && setOpen(false)
    window.addEventListener('keydown', key)
    window.addEventListener('mousedown', click)
    return () => {
      window.removeEventListener('keydown', key)
      window.removeEventListener('mousedown', click)
    }
  }, [open])
  // Lively but settled: the card travels and resizes on one spring.
  const spring = { type: 'spring' as const, stiffness: 190, damping: 24, mass: 0.9 }
  const linkCls = 'flex h-9 w-full items-center rounded-[4px] px-3 text-left text-sm text-foreground transition-colors hover:bg-muted hover:text-heading'
  const iconBtn = 'flex size-9 shrink-0 items-center justify-center rounded-[4px] text-muted-foreground transition-colors hover:text-heading'

  return (
    <div ref={root}>
      <motion.div
        initial={false}
        animate={expanded ? g.rail : scrolled ? g.dot : g.bar}
        transition={spring}
        onMouseEnter={() => scrolled && setHover(true)}
        onMouseLeave={() => setHover(false)}
        className={`fixed z-50 border border-border backdrop-blur-xl ${
          scrolled ? `bg-background/85 shadow-[0_12px_40px_-10px_rgb(124_92_255/0.6)] ${open ? 'border-primary/60' : ''}` : 'bg-background/75 shadow-[0_12px_40px_-12px_rgb(0_0_0/0.5)]'
        }`}
        style={{ transitionProperty: 'background-color, box-shadow', transitionDuration: '300ms' }}
      >
        <FrameCorners />
        <div className="absolute inset-0 overflow-hidden">
          {/* The bar's contents keep their full width and get revealed / covered as the card resizes. */}
          <motion.div
            initial={false}
            animate={{ opacity: scrolled ? 0 : 1 }}
            transition={scrolled ? { duration: 0.12 } : { duration: 0.3, delay: 0.18 }}
            style={{ width: g.bar.width - 2, pointerEvents: scrolled ? 'none' : 'auto' }}
            aria-hidden={scrolled}
            className="flex h-full items-center gap-1 pr-2 pl-[13px] sm:gap-2 sm:pr-3"
          >
            <a href="/" className="mr-2 flex shrink-0 items-center gap-2 font-semibold text-heading sm:mr-4" tabIndex={scrolled ? -1 : 0}>
              <span className="size-7" />
              Twinglass
            </a>
            <nav aria-label="Main" className="hidden items-center lg:flex">
              {links.map(([label, hash]) => (
                <button key={hash} type="button" tabIndex={scrolled ? -1 : 0} onClick={() => go(hash)} className="h-8 rounded-[4px] px-2.5 text-sm text-muted-foreground transition-colors hover:text-heading">
                  {label}
                </button>
              ))}
              <span aria-hidden className="mx-1 h-4 w-px bg-border" />
              {pages.map(([label, href]) => (
                <a
                  key={href}
                  href={href}
                  tabIndex={scrolled ? -1 : 0}
                  className={`flex h-8 items-center rounded-[4px] px-2.5 text-sm transition-colors hover:text-heading ${window.location.pathname.startsWith(href) ? 'text-heading' : 'text-muted-foreground'}`}
                >
                  {label}
                </a>
              ))}
            </nav>
            <span className="ml-auto" />
            <span className="hidden sm:contents">
              <ThemeToggle />
              <a href={REPO} target="_blank" rel="noopener noreferrer" aria-label="GitHub" tabIndex={scrolled ? -1 : 0} className={iconBtn}>
                <GithubMark className="size-[18px]" />
              </a>
            </span>
            <button
              type="button"
              tabIndex={scrolled ? -1 : 0}
              onClick={openDownload}
              aria-label="Download"
              className="flex h-8 shrink-0 items-center gap-1.5 rounded-[4px] bg-heading px-2.5 text-sm font-medium text-background transition-opacity hover:opacity-85 sm:px-3"
            >
              <Download className="size-4" />
              <span className="hidden sm:inline">Download</span>
            </button>
            <button
              type="button"
              tabIndex={scrolled ? -1 : 0}
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-label={open ? 'Close menu' : 'Open menu'}
              className={`${iconBtn} lg:hidden`}
            >
              {open ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </motion.div>

          {/* The corner card's rail: a few quick actions that appear as it grows upward. */}
          {scrolled && (
            <motion.div
              initial={false}
              animate={{ opacity: expanded ? 1 : 0, y: expanded ? 0 : 12 }}
              transition={expanded ? { duration: 0.22, delay: 0.08 } : { duration: 0.1 }}
              style={{ pointerEvents: expanded ? 'auto' : 'none' }}
              aria-hidden={!expanded}
              className="absolute inset-x-0 top-0 flex flex-col items-center gap-1 pt-2.5"
            >
              <button type="button" tabIndex={expanded ? 0 : -1} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="Back to top" title="Back to top" className={iconBtn}>
                <ArrowUp className="size-[18px]" />
              </button>
              <ThemeToggle />
              <a href={REPO} target="_blank" rel="noopener noreferrer" tabIndex={expanded ? 0 : -1} aria-label="GitHub" title="GitHub" className={iconBtn}>
                <GithubMark className="size-[18px]" />
              </a>
              <button type="button" tabIndex={expanded ? 0 : -1} onClick={() => (setOpen(false), openDownload())} aria-label="Download" title="Download" className={iconBtn}>
                <Download className="size-[18px]" />
              </button>
            </motion.div>
          )}
        </div>

        {/* The icon rides along inside the card: the bar's logo at the top, the whole button in the corner. */}
        <span className="pointer-events-none absolute bottom-[13px] left-[13px] size-7">
          <LogoMark className="size-7 text-heading" />
        </span>
        {scrolled && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={expanded}
            aria-label={open ? 'Unpin quick actions' : 'Pin quick actions'}
            title={open ? 'Click to unpin' : 'Click to keep open'}
            className="absolute inset-x-0 bottom-0 h-[54px]"
          />
        )}
      </motion.div>

      <AnimatePresence>
        {open && !scrolled && (
          <motion.nav
            key="down"
            aria-label="Menu"
            initial={{ opacity: 0, y: -10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.18 }}
            style={{ right: g.barRight, top: g.bar.top + 56 + 8 }}
            className="fixed z-50 w-60 origin-top-right border border-border bg-background/90 p-2 shadow-[0_20px_60px_-15px_rgb(0_0_0/0.6)] backdrop-blur-xl"
          >
            <FrameCorners />
            {links.map(([label, hash]) => (
              <button key={hash} type="button" onClick={() => (setOpen(false), go(hash))} className={linkCls}>
                {label}
              </button>
            ))}
            <span aria-hidden className="mx-3 my-1.5 block h-px bg-border" />
            {pages.map(([label, href]) => (
              <a key={href} href={href} className={linkCls}>
                {label}
              </a>
            ))}
            <span aria-hidden className="mx-3 my-1.5 block h-px bg-border" />
            <div className="flex items-center gap-1 px-1">
              <ThemeToggle />
              <a href={REPO} target="_blank" rel="noopener noreferrer" aria-label="GitHub" className={iconBtn}>
                <GithubMark className="size-[18px]" />
              </a>
              <button
                type="button"
                onClick={() => (setOpen(false), openDownload())}
                className="ml-auto flex h-8 items-center gap-1.5 rounded-[4px] bg-heading px-3 text-sm font-medium text-background transition-opacity hover:opacity-85"
              >
                <Download className="size-4" />
                Download
              </button>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </div>
  )
}
