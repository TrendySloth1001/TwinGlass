// VS Code's window chrome for the site: title bar with a command center, a ⌘K command palette,
// and the status bar along the bottom.
import { AnimatePresence, motion } from 'motion/react'
import { Bell, Bot, Download, FileText, GitBranch, HelpCircle, LayoutGrid, Search, ShieldCheck, Smartphone, Sparkles, Workflow, type LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { GithubMark, REPO } from './base'
import { useDownload } from './download'

type Command = { icon: LucideIcon; label: string; hint?: string; run: () => void }

function go(hash: string) {
  if (window.location.pathname !== '/') window.location.href = `/${hash}`
  else document.querySelector(hash)?.scrollIntoView({ behavior: 'smooth' })
}

function useCommands(): Command[] {
  const { openDownload } = useDownload()
  return useMemo(
    () => [
      { icon: Download, label: 'Twinglass: Download for Mac', hint: 'DMG, terminal or Homebrew', run: openDownload },
      { icon: LayoutGrid, label: 'Go to: Features', run: () => go('#features') },
      { icon: Workflow, label: 'Go to: How it works', run: () => go('#how') },
      { icon: Smartphone, label: 'Go to: The phone app', run: () => go('#phone') },
      { icon: Bot, label: 'Go to: For coding agents', run: () => go('#agents') },
      { icon: ShieldCheck, label: 'Go to: Privacy', run: () => go('#privacy') },
      { icon: Sparkles, label: 'Go to: What’s new', run: () => go('#changelog') },
      { icon: HelpCircle, label: 'Go to: FAQ', run: () => go('#faq') },
      { icon: FileText, label: 'Open: Privacy Policy', run: () => (window.location.href = '/privacy') },
      { icon: GitBranch, label: 'Open: Source on GitHub', hint: 'github.com', run: () => window.open(REPO, '_blank', 'noopener') },
      { icon: FileText, label: 'Open: Changelog', hint: 'github.com', run: () => window.open(`${REPO}/blob/master/CHANGELOG.md`, '_blank', 'noopener') },
    ],
    [openDownload],
  )
}

function Palette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const commands = useCommands()
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const list = commands.filter((c) => c.label.toLowerCase().includes(q.toLowerCase().replace(/^>\s*/, '')))
  useEffect(() => {
    if (open) {
      setQ('')
      setI(0)
      setTimeout(() => input.current?.focus(), 0)
    }
  }, [open])
  const run = (c?: Command) => {
    if (!c) return
    onClose()
    setTimeout(c.run, 0)
  }
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[110] flex justify-center bg-black/30 px-3 pt-16" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div
            role="dialog"
            aria-label="Command palette"
            initial={{ y: -8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -6, opacity: 0 }}
            transition={{ duration: 0.14 }}
            onClick={(e) => e.stopPropagation()}
            className="h-fit w-full max-w-xl overflow-hidden rounded-md border border-[#454545] bg-[#222222] shadow-[0_8px_32px_rgb(0_0_0/0.6)]"
          >
            <div className="p-1.5">
              <input
                ref={input}
                value={q}
                onChange={(e) => {
                  setQ(e.target.value)
                  setI(0)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') (e.preventDefault(), setI((k) => Math.min(k + 1, list.length - 1)))
                  else if (e.key === 'ArrowUp') (e.preventDefault(), setI((k) => Math.max(k - 1, 0)))
                  else if (e.key === 'Enter') run(list[i])
                  else if (e.key === 'Escape') onClose()
                }}
                placeholder="Type a command or jump to a section"
                aria-label="Command"
                className="h-8 w-full rounded-[3px] border border-primary bg-input px-2 text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
              />
            </div>
            <ul role="listbox" className="max-h-80 overflow-y-auto pb-1.5">
              {list.map((c, k) => (
                <li key={c.label} role="option" aria-selected={k === i}>
                  <button
                    type="button"
                    onMouseEnter={() => setI(k)}
                    onClick={() => run(c)}
                    className={`flex h-[26px] w-full items-center gap-2 px-3 text-left text-[13px] ${k === i ? 'bg-[#04395e] text-white' : 'text-foreground'}`}
                  >
                    <c.icon className="size-4 shrink-0 opacity-80" strokeWidth={1.6} />
                    <span className="truncate">{c.label}</span>
                    {c.hint && <span className="ml-auto truncate text-xs text-muted-foreground">{c.hint}</span>}
                  </button>
                </li>
              ))}
              {list.length === 0 && <li className="px-3 py-1.5 text-[13px] text-muted-foreground">No matching commands</li>}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** The title bar: name and menus on the left, the command center in the middle, actions on the right. */
export function TitleBar() {
  const { openDownload } = useDownload()
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)
      if ((e.metaKey || e.ctrlKey) && (e.key.toLowerCase() === 'k' || (e.shiftKey && e.key.toLowerCase() === 'p'))) {
        e.preventDefault()
        setOpen((o) => !o)
      } else if (e.key === '/' && !typing) {
        e.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const menu = [
    ['Features', '#features'],
    ['How it works', '#how'],
    ['Agents', '#agents'],
    ['FAQ', '#faq'],
  ]
  return (
    <>
      <header className="sticky top-0 z-50 flex h-11 items-center gap-2 border-b border-border bg-tile/95 px-3 backdrop-blur sm:px-4">
        <a href="/" className="flex shrink-0 items-center gap-2 pr-2 text-[13px] font-semibold text-heading">
          <img src="/icon.png" alt="" className="size-5 rounded-[4px]" />
          Twinglass
        </a>
        <nav aria-label="Main" className="hidden items-center lg:flex">
          {menu.map(([label, hash]) => (
            <button key={hash} type="button" onClick={() => go(hash)} className="h-7 rounded-[4px] px-2 text-[13px] text-foreground/90 transition-colors hover:bg-muted">
              {label}
            </button>
          ))}
        </nav>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mx-auto flex h-7 w-full max-w-sm min-w-0 items-center gap-2 rounded-md border border-input-border bg-input/60 px-2.5 text-[12.5px] text-muted-foreground transition-colors hover:bg-input"
        >
          <Search className="size-3.5 shrink-0" />
          <span className="truncate">Twinglass</span>
          <kbd className="ml-auto hidden rounded-[3px] border border-input-border px-1 font-mono text-[10.5px] sm:block">⌘K</kbd>
        </button>
        <a href={REPO} target="_blank" rel="noopener noreferrer" aria-label="GitHub" className="flex size-7 shrink-0 items-center justify-center rounded-[4px] text-foreground transition-colors hover:bg-muted">
          <GithubMark />
        </a>
        <button type="button" onClick={openDownload} className="flex h-7 shrink-0 items-center gap-1.5 rounded-[4px] bg-primary px-3 text-[13px] font-medium text-white transition-colors hover:bg-primary-hover">
          <Download className="size-3.5" />
          <span className="hidden sm:inline">Download</span>
        </button>
      </header>
      <Palette open={open} onClose={() => setOpen(false)} />
    </>
  )
}

/** VS Code's status bar: remote indicator on the left, facts on the right. */
export function StatusBar() {
  const { latest } = useDownload()
  const item = 'flex h-full items-center gap-1 px-2 transition-colors hover:bg-white/10'
  return (
    <footer className="fixed inset-x-0 bottom-0 z-50 flex h-[22px] items-center border-t border-border bg-tile text-[12px] text-muted-foreground">
      <span className="flex h-full items-center gap-1.5 bg-primary px-2.5 text-white">
        <Smartphone className="size-3.5" strokeWidth={2} />
        Twinglass
      </span>
      <a href={REPO} target="_blank" rel="noopener noreferrer" className={item}>
        <GitBranch className="size-3.5" />
        master
      </a>
      <a href="/#changelog" className={item}>
        v{latest.version}
      </a>
      <span className="ml-auto hidden h-full items-center sm:flex">
        <span className="px-2">macOS 13+ · Apple Silicon</span>
        <span className="px-2">Android 10+</span>
        <a href="/privacy" className={item}>
          <ShieldCheck className="size-3.5" />
          Privacy
        </a>
      </span>
      <span className={`${item} ml-auto sm:ml-0`}>
        <Bell className="size-3.5" />
      </span>
    </footer>
  )
}
