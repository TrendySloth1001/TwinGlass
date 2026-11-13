// Building blocks in VS Code's design language (Dark Modern): badges, buttons, editor tabs.
import { ArrowUpRight, Check, ChevronRight, Copy } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import type { SimpleIcon } from 'simple-icons'
import changelog from '../data/changelog.json'
import release from '../data/release.json'

export const REPO = release.repo
/** Released versions only: an entry written ahead of a release stays hidden until that version ships. */
const newer = (a: string, b: string): boolean => {
  const x = a.split('.').map(Number)
  const y = b.split('.').map(Number)
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0)
  return false
}
export const RELEASES = changelog.releases.filter((r) => !newer(r.version, release.version))
export const INSTALL = 'curl -fsSL https://raw.githubusercontent.com/TrendySloth1001/TwinGlass/master/install.sh | bash'
export const BREW = 'brew tap TrendySloth1001/tap && brew trust TrendySloth1001/tap\nbrew install --cask twinglass'

/** The L7 frame: corner marks (⌜ ⌝ ⌞ ⌟) drawn on a card's hairlines. Cards stay square. */
export function FrameCorners() {
  const corners = ['-top-px -left-px border-t border-l', '-top-px -right-px border-t border-r', '-bottom-px -left-px border-b border-l', '-bottom-px -right-px border-b border-r']
  return corners.map((c) => <span key={c} aria-hidden className={`pointer-events-none absolute size-3.5 border-foreground/55 ${c}`} />)
}

/** VS Code's badge / tag chip: square-ish, small, quiet. */
export function Chip({ children, dot = false, className }: { children: ReactNode; dot?: boolean; className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-[3px] border border-input-border bg-input px-1.5 py-[3px] font-mono text-[11px] leading-none whitespace-nowrap text-foreground ${className ?? ''}`}
    >
      {dot && <span aria-hidden className="size-1.5 rounded-full bg-mark" />}
      {children}
    </span>
  )
}

/**
 * A chip that sits inside a sentence, with a small icon or a brand logo (Simple Icons, CC0;
 * the brands stay their owners' marks and are only used to say what Twinglass works with).
 */
export function Tag({ icon: Icon, logo, children }: { icon?: LucideIcon; logo?: SimpleIcon; children: ReactNode }) {
  return (
    <span className="mx-0.5 inline-flex items-center gap-[0.3em] rounded-[4px] border border-input-border bg-input px-[0.4em] py-[0.15em] align-[-0.12em] text-[0.88em] leading-none font-medium whitespace-nowrap text-heading">
      {logo ? (
        <svg viewBox="0 0 24 24" aria-hidden className="size-[0.95em] shrink-0" fill="currentColor">
          <path d={logo.path} />
        </svg>
      ) : Icon ? (
        <Icon aria-hidden className="size-[0.95em] shrink-0 text-mark" strokeWidth={2} />
      ) : null}
      {children}
    </span>
  )
}

/** Primary button: white, square, with a chevron. A button, or a link with href. */
export function HoverButton({ children, onClick, disabled, href }: { children: ReactNode; onClick?: () => void; disabled?: boolean; href?: string }) {
  const cls =
    'group inline-flex h-10 items-center gap-1.5 rounded-[4px] bg-heading pr-3 pl-4 text-sm font-medium text-background transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:bg-input disabled:text-muted-foreground'
  const inner = (
    <>
      {children}
      <ChevronRight className="size-4 transition-transform group-enabled:group-hover:translate-x-0.5 group-[:is(a)]:group-hover:translate-x-0.5" />
    </>
  )
  return href ? (
    <a href={href} className={cls}>
      {inner}
    </a>
  ) : (
    <button type="button" onClick={onClick} disabled={disabled} className={cls}>
      {inner}
    </button>
  )
}

/** Secondary button: outlined. */
export function GhostLink({ href, children }: { href: string; children: ReactNode }) {
  const external = href.startsWith('http')
  return (
    <a
      href={href}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className="inline-flex h-10 items-center gap-1.5 rounded-[4px] border border-heading/70 px-4 text-sm font-medium text-heading transition-colors hover:bg-muted"
    >
      {children}
      {external && <ArrowUpRight className="size-4" />}
    </a>
  )
}

export function CopyCommand({ command, label, disabled = false }: { command: string; label: string; disabled?: boolean }) {
  const [done, setDone] = useState(false)
  return (
    <div className={`relative flex items-start gap-3 rounded-[4px] border border-border bg-tile p-2.5 pl-3 text-left transition-opacity ${disabled ? 'opacity-55' : ''}`}>
      <span className="mt-0.5 shrink-0">
        <Chip>{label}</Chip>
      </span>
      <pre className={`min-w-0 flex-1 overflow-x-auto py-0.5 font-mono text-[13px] leading-relaxed whitespace-pre text-foreground ${disabled ? 'select-none blur-[2px]' : ''}`}>{command}</pre>
      <button
        type="button"
        disabled={disabled}
        aria-label={`Copy the ${label} command`}
        title={disabled ? 'Agree to the privacy policy first' : 'Copy'}
        onClick={() =>
          void navigator.clipboard.writeText(command).then(() => {
            setDone(true)
            setTimeout(() => setDone(false), 1400)
          })
        }
        className="flex size-7 shrink-0 items-center justify-center rounded-[4px] text-muted-foreground transition-colors enabled:hover:bg-muted enabled:hover:text-foreground disabled:cursor-not-allowed"
      >
        {done ? <Check className="size-4 text-mark" /> : <Copy className="size-4" />}
      </button>
    </div>
  )
}

/** A command inside a sentence, with a copy button right next to it. */
export function CopyInline({ command }: { command: string }) {
  const [done, setDone] = useState(false)
  return (
    <span className="mx-0.5 inline-flex max-w-full items-center gap-1 rounded-[4px] border border-input-border bg-input py-px pr-0.5 pl-1.5 align-middle">
      <code className="min-w-0 truncate font-mono text-[0.92em] text-heading">{command}</code>
      <button
        type="button"
        aria-label={`Copy ${command}`}
        title={done ? 'Copied' : 'Copy'}
        onClick={() =>
          void navigator.clipboard.writeText(command).then(() => {
            setDone(true)
            setTimeout(() => setDone(false), 1400)
          })
        }
        className="flex size-5 shrink-0 items-center justify-center rounded-[3px] text-muted-foreground transition-colors hover:bg-muted hover:text-heading"
      >
        {done ? <Check className="size-3 text-mark" /> : <Copy className="size-3" />}
      </button>
    </span>
  )
}

/** Section heading: a code-comment label, then the title. */
export function SectionHead({ n, label, title, children }: { n: string; label: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="max-w-2xl">
      <p className="flex items-center gap-2 font-mono text-xs text-muted-foreground uppercase">
        <span className="text-mark">{n}</span>
        <span aria-hidden className="h-px w-6 bg-border" />
        {label}
      </p>
      <h2 className="font-soft mt-3 text-[2rem] leading-[1.12] font-semibold text-balance sm:text-[2.5rem]">{title}</h2>
      {children && <p className="mt-4 text-pretty text-muted-foreground sm:text-[17px]">{children}</p>}
    </div>
  )
}

export function GithubMark({ className = 'size-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden className={className}>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  )
}
