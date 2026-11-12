// Downloading needs the visitor to agree to the privacy policy first (a ticked checkbox). The
// agreement is remembered in this browser for the current policy version only.
import { AnimatePresence, motion } from 'motion/react'
import { AppWindow, Check, ChevronDown, Copy, Lock, Plus, QrCode, X, type LucideIcon } from 'lucide-react'
import { siHomebrew, type SimpleIcon } from 'simple-icons'
import { createContext, useCallback, useContext, useEffect, useId, useState, type ReactNode } from 'react'
import { Chip, FrameCorners, HoverButton, INSTALL, REPO, Tag } from './base'
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

function Mark({ logo, icon: Icon, className }: { logo?: SimpleIcon; icon?: LucideIcon; className?: string }) {
  if (logo)
    return (
      <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
        <path d={logo.path} />
      </svg>
    )
  return Icon ? <Icon aria-hidden className={className} strokeWidth={1.8} /> : null
}

/** One step of the vertical stepper: a small circle on a line, then the content. */
function Step({ n, state, last, title, children }: { n: number; state: 'done' | 'now' | 'next'; last?: boolean; title: ReactNode; children?: ReactNode }) {
  return (
    <li className="relative grid grid-cols-[1.5rem_1fr] gap-x-4">
      {!last && <span aria-hidden className={`absolute top-7 bottom-0 left-3 w-px -translate-x-1/2 ${state === 'done' ? 'bg-ok/50' : 'bg-input-border'}`} />}
      <span
        className={`relative z-10 mt-0.5 flex size-6 items-center justify-center rounded-full text-[11px] font-semibold transition-colors ${
          state === 'done' ? 'bg-ok text-black' : state === 'now' ? 'bg-primary text-white ring-4 ring-primary/20' : 'border border-input-border bg-tile text-muted-foreground'
        }`}
      >
        {state === 'done' ? <Check className="size-3.5" strokeWidth={3} /> : n}
      </span>
      <div className={`min-w-0 pb-7 ${last ? 'pb-0' : ''}`}>
        <div className={`text-sm font-medium ${state === 'next' ? 'text-muted-foreground' : 'text-heading'}`}>{title}</div>
        {children && <div className="mt-3">{children}</div>}
      </div>
    </li>
  )
}

function CommandBox({ lines, disabled }: { lines: string[]; disabled: boolean }) {
  const [done, setDone] = useState(false)
  return (
    <div className="flex items-start gap-3 border border-input-border bg-[#0d0d10] p-3 pl-3.5">
      <pre className="min-w-0 flex-1 font-mono text-[12.5px] leading-relaxed [overflow-wrap:anywhere] whitespace-pre-wrap text-heading">
        {lines.map((l) => (
          <span key={l} className="block">
            <span className="text-muted-foreground select-none">$ </span>
            {l}
          </span>
        ))}
      </pre>
      <button
        type="button"
        disabled={disabled}
        onClick={() =>
          void navigator.clipboard.writeText(lines.join('\n')).then(() => {
            setDone(true)
            setTimeout(() => setDone(false), 1500)
          })
        }
        className="flex h-7 shrink-0 items-center gap-1.5 rounded-[4px] border border-input-border bg-input px-2.5 text-xs text-heading transition-colors enabled:hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
      >
        {done ? <Check className="size-3.5 text-ok" /> : <Copy className="size-3.5" />}
        {done ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

/**
 * The download flow, used in the page and in the dialog: a slim stepper. 1 agree (the checkbox is
 * the step), 2 pick how to install, 3 what happens next, as a sentence of chips.
 */
export function DownloadFlow() {
  const { agreed, setAgreed, latest } = useDownload()
  const [brew, setBrew] = useState(false)
  const uid = useId()
  return (
    <ol className="text-left">
      <Step
        n={1}
        state={agreed ? 'done' : 'now'}
        title={
          <label htmlFor={`consent-${uid}`} className="flex cursor-pointer items-center gap-2.5 select-none">
            <span className="relative flex size-[18px] shrink-0 items-center justify-center">
              <input id={`consent-${uid}`} type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="peer absolute inset-0 cursor-pointer opacity-0" />
              <span className="flex size-[18px] items-center justify-center rounded-[4px] border border-input-border bg-input transition-colors peer-checked:border-primary peer-checked:bg-primary peer-focus-visible:outline peer-focus-visible:outline-1 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary">
                <Check className={`size-3 text-white transition-transform ${agreed ? 'scale-100' : 'scale-0'}`} strokeWidth={3.5} />
              </span>
            </span>
            <span>
              I agree to the{' '}
              <a href="/privacy" target="_blank" rel="noopener" className="text-mark hover:underline" onClick={(e) => e.stopPropagation()}>
                Privacy Policy
              </a>
            </span>
          </label>
        }
      />
      <Step n={2} state={agreed ? 'now' : 'next'} title="Install">
        <div className="flex flex-wrap items-center gap-3">
          <DownloadButton label={`Download Twinglass ${latest.version}`} />
          <span className="font-mono text-[11px] text-muted-foreground">DMG · ~120 MB · Apple Silicon</span>
        </div>
        <p className="mt-4 mb-2 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="h-px w-4 bg-input-border" /> or from the terminal, which opens with no macOS warning
        </p>
        <CommandBox lines={[INSTALL]} disabled={!agreed} />
        <button
          type="button"
          onClick={() => setBrew((b) => !b)}
          aria-expanded={brew}
          className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-heading"
        >
          <Mark logo={siHomebrew} className="size-3.5" />
          Prefer Homebrew?
          <ChevronDown className={`size-3.5 transition-transform ${brew ? 'rotate-180' : ''}`} />
        </button>
        <AnimatePresence initial={false}>
          {brew && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
              <div className="pt-2">
                <CommandBox lines={['brew tap TrendySloth1001/tap', 'brew trust TrendySloth1001/tap', 'brew install --cask twinglass']} disabled={!agreed} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          {agreed ? (
            <>
              DMG: open it and drag Twinglass into Applications. It isn’t notarized yet, so if macOS refuses to open it, run{' '}
              <code className="font-mono">xattr -cr /Applications/Twinglass.app</code> once.
            </>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <Lock className="size-3" /> Agree to the policy above to unlock the download.
            </span>
          )}
        </p>
      </Step>
      <Step n={3} state="next" last title="Then">
        <p className="text-sm leading-[2.1]">
          Open <Tag icon={AppWindow}>Twinglass</Tag>, click <Tag icon={Plus}>Add phone</Tag>, and scan the <Tag icon={QrCode}>QR</Tag> with your phone.
        </p>
      </Step>
    </ol>
  )
}

export function DownloadPanel() {
  const { latest } = useDownload()
  return (
    <div className="relative border border-border bg-tile/95 px-6 py-10 backdrop-blur sm:px-10 sm:py-12">
      <FrameCorners />
      <BorderBeam seconds={9} />
      <div className="flex flex-col items-center text-center">
        <img src="/icon-large.png" alt="" className="size-16 rounded-[22%] shadow-[0_10px_40px_-8px_rgb(124_92_255/0.7)]" width={64} height={64} loading="lazy" />
        <h2 className="font-soft mt-5 text-4xl sm:text-5xl">Get Twinglass</h2>
        <p className="mt-3 max-w-md text-sm leading-relaxed">It updates itself and brings the phone app along, so your phone never downloads anything.</p>
        <div className="mt-4 flex flex-wrap justify-center gap-1.5">
          <Chip>v{latest.version}</Chip>
          <Chip>macOS 13+</Chip>
          <Chip>Apple Silicon</Chip>
          <Chip>Free</Chip>
        </div>
      </div>
      <div className="mt-8 border-t border-border pt-8">
        <DownloadFlow />
      </div>
      <p className="mt-8 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <a href={`${REPO}/releases`} target="_blank" rel="noopener noreferrer" className="hover:text-heading">
          All releases ↗
        </a>
        <a href="/privacy" className="hover:text-heading">
          Privacy policy
        </a>
        <a href={`${REPO}/blob/master/CHANGELOG.md`} target="_blank" rel="noopener noreferrer" className="hover:text-heading">
          Changelog ↗
        </a>
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
            className="relative max-h-[92vh] w-full max-w-lg overflow-y-auto border border-input-border bg-tile p-6 shadow-[0_8px_40px_rgb(0_0_0/0.6)] sm:p-8"
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
            <div className="mt-6">
              <DownloadFlow />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
