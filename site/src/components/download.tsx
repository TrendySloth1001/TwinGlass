// Downloading needs the visitor to agree to the privacy policy first (a ticked checkbox). The
// agreement is remembered in this browser for the current policy version only.
import { AnimatePresence, motion } from 'motion/react'
import { Check, X } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { BREW, CopyCommand, FrameCorners, GhostLink, HoverButton, INSTALL, REPO } from './base'
import { BorderBeam } from './fx'
import release from '../data/release.json'

export const POLICY_VERSION = '2026-11-12'
const KEY = 'twinglass:privacy-accepted'

type Latest = { version: string; dmg: string }
type Ctx = { agreed: boolean; setAgreed: (v: boolean) => void; latest: Latest; openDownload: () => void }
const DownloadCtx = createContext<Ctx | null>(null)
export const useDownload = () => useContext(DownloadCtx)!

/** Asks GitHub for the newest release at page load, so the button never goes stale between site deploys. */
function useLatest(): Latest {
  const [latest, setLatest] = useState<Latest>({ version: release.version, dmg: release.dmg })
  useEffect(() => {
    fetch('https://api.github.com/repos/TrendySloth1001/TwinGlass/releases/latest', { headers: { Accept: 'application/vnd.github+json' } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { tag_name?: string; assets?: { name: string; browser_download_url: string }[] } | null) => {
        const dmg = j?.assets?.find((a) => a.name.endsWith('arm64.dmg'))?.browser_download_url
        if (j?.tag_name && dmg) setLatest({ version: j.tag_name.replace(/^v/, ''), dmg })
      })
      .catch(() => {})
  }, [])
  return latest
}

export function DownloadProvider({ children }: { children: ReactNode }) {
  const [agreed, set] = useState(() => {
    try {
      return localStorage.getItem(KEY) === POLICY_VERSION
    } catch {
      return false
    }
  })
  const [open, setOpen] = useState(false)
  const latest = useLatest()
  const setAgreed = useCallback((v: boolean) => {
    set(v)
    try {
      if (v) localStorage.setItem(KEY, POLICY_VERSION)
      else localStorage.removeItem(KEY)
    } catch {
      /* private mode: just this visit */
    }
  }, [])
  return (
    <DownloadCtx.Provider value={{ agreed, setAgreed, latest, openDownload: () => setOpen(true) }}>
      {children}
      <DownloadDialog open={open} onClose={() => setOpen(false)} />
    </DownloadCtx.Provider>
  )
}

export function ConsentCheck({ id }: { id: string }) {
  const { agreed, setAgreed } = useDownload()
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3 text-left text-sm select-none">
      <span className="relative mt-0.5 flex size-5 shrink-0 items-center justify-center">
        <input id={id} type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="peer absolute inset-0 cursor-pointer opacity-0" />
        <span className="flex size-[18px] items-center justify-center rounded-[3px] border border-input-border bg-input transition-colors peer-checked:border-primary peer-checked:bg-primary peer-focus-visible:outline peer-focus-visible:outline-1 peer-focus-visible:outline-offset-1 peer-focus-visible:outline-primary">
          <Check className={`size-3.5 text-white transition-transform ${agreed ? 'scale-100' : 'scale-0'}`} strokeWidth={3} />
        </span>
      </span>
      <span className="text-muted-foreground">
        I’ve read and agree to the{' '}
        <a href="/privacy" target="_blank" rel="noopener" className="font-medium text-mark hover:underline">
          Privacy Policy
        </a>
        .
      </span>
    </label>
  )
}

/** Download button that only works after agreeing. */
export function DownloadButton({ label }: { label?: string }) {
  const { agreed, latest } = useDownload()
  return (
    <span title={agreed ? undefined : 'Agree to the privacy policy first'}>
      <HoverButton disabled={!agreed} onClick={() => agreed && (window.location.href = latest.dmg)}>
        {label ?? `Download v${latest.version}`}
      </HoverButton>
    </span>
  )
}

export function DownloadPanel() {
  const { agreed, latest } = useDownload()
  return (
    <div className="relative border border-border bg-tile px-6 py-12 text-center sm:px-12 sm:py-16">
      <FrameCorners />
      <BorderBeam seconds={9} />
      <img src="/icon-large.png" alt="" className="mx-auto size-20 rounded-[22%] shadow-sm" width={80} height={80} loading="lazy" />
      <h2 className="font-soft mt-6 text-4xl font-semibold tracking-tight sm:text-5xl">Get Twinglass</h2>
      <p className="mx-auto mt-3 max-w-md text-muted-foreground">
        Free for macOS 13 or newer on Apple Silicon. It updates itself, and it brings the phone app along, so your phone never has to download anything.
      </p>
      <div className="mx-auto mt-8 flex max-w-md justify-center">
        <ConsentCheck id="consent-panel" />
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <DownloadButton />
        <GhostLink href={`${REPO}/releases`}>All releases</GhostLink>
      </div>
      <div className="mx-auto mt-10 flex max-w-2xl flex-col gap-2">
        <CopyCommand label="Terminal" command={INSTALL} disabled={!agreed} />
        <CopyCommand label="Homebrew" command={BREW} disabled={!agreed} />
      </div>
      <p className="mx-auto mt-5 max-w-xl text-xs text-muted-foreground">
        v{latest.version} · Not notarized yet: the terminal and Homebrew installs open straight away. If you download the DMG in a browser, run{' '}
        <code className="font-mono">xattr -cr /Applications/Twinglass.app</code> once.
      </p>
    </div>
  )
}

function DownloadDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { agreed, latest } = useDownload()
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-3 sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="dl-title"
            initial={{ y: 24, scale: 0.97, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 16, scale: 0.98, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-lg border border-input-border bg-tile p-6 shadow-[0_8px_40px_rgb(0_0_0/0.6)] sm:p-8"
          >
            <FrameCorners />
            <button type="button" onClick={onClose} aria-label="Close" className="absolute top-4 right-4 flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
              <X className="size-4" />
            </button>
            <div className="flex items-center gap-4">
              <img src="/icon-large.png" alt="" className="size-14 rounded-[22%]" width={56} height={56} />
              <div className="text-left">
                <h2 id="dl-title" className="text-xl font-semibold tracking-tight">
                  Download Twinglass
                </h2>
                <p className="font-mono text-xs text-muted-foreground">v{latest.version} · macOS 13+ · Apple Silicon · ~120 MB</p>
              </div>
            </div>
            <p className="mt-5 text-left text-sm text-muted-foreground">
              Twinglass has no accounts and no analytics. The only thing it fetches from the internet is the update check. The policy explains exactly what
              stays where.
            </p>
            <div className="relative mt-5 border border-border bg-background p-4">
              <FrameCorners />
              <ConsentCheck id="consent-dialog" />
            </div>
            <div className="mt-5 flex flex-col gap-2">
              <DownloadButton label="Download the DMG" />
              <CopyCommand label="Terminal" command={INSTALL} disabled={!agreed} />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
