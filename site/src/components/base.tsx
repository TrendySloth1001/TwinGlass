// Building blocks in VS Code's design language (Dark Modern): badges, buttons, editor tabs.
import { ArrowRight, ArrowUpRight, Check, Copy, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import changelog from '../data/changelog.json'
import release from '../data/release.json'

export const REPO = release.repo
export const RELEASES = changelog.releases
export const INSTALL = 'curl -fsSL https://raw.githubusercontent.com/TrendySloth1001/TwinGlass/master/install.sh | bash'
export const BREW = 'brew tap TrendySloth1001/tap && brew trust TrendySloth1001/tap\nbrew install --cask twinglass'

/** Kept for older call sites: VS Code has no corner marks, so this draws nothing. */
export function FrameCorners() {
  return null
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

/** VS Code's primary button. A button, or a link with href. */
export function HoverButton({ children, onClick, disabled, href }: { children: ReactNode; onClick?: () => void; disabled?: boolean; href?: string }) {
  const cls =
    'group inline-flex h-10 items-center gap-2 rounded-[4px] bg-primary px-5 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-input disabled:text-muted-foreground'
  const inner = (
    <>
      {children}
      <ArrowRight className="size-4 transition-transform group-enabled:group-hover:translate-x-0.5 group-[:is(a)]:group-hover:translate-x-0.5" />
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

/** VS Code's secondary button. */
export function GhostLink({ href, children }: { href: string; children: ReactNode }) {
  const external = href.startsWith('http')
  return (
    <a
      href={href}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className="inline-flex h-10 items-center gap-1.5 rounded-[4px] bg-input px-5 text-sm font-medium text-foreground transition-colors hover:bg-input-border"
    >
      {children}
      {external && <ArrowUpRight className="size-4" />}
    </a>
  )
}

/** An editor tab strip on top of a panel: one active tab with VS Code's blue top border. */
export function EditorTabs({ tabs, active = 0, right }: { tabs: { icon?: ReactNode; label: string }[]; active?: number; right?: ReactNode }) {
  return (
    <div className="flex h-9 items-stretch border-b border-border bg-tile text-[13px]">
      {tabs.map((t, i) => (
        <span
          key={t.label}
          className={`flex items-center gap-2 border-r border-border px-3 ${i === active ? 'relative bg-background text-heading before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-primary' : 'text-muted-foreground'}`}
        >
          {t.icon}
          <span className="truncate">{t.label}</span>
          {i === active && <X aria-hidden className="size-3.5 opacity-60" />}
        </span>
      ))}
      <span className="ml-auto flex items-center pr-3">{right}</span>
    </div>
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

/** Section heading: a code-comment label, then the title. */
export function SectionHead({ n, label, title, children }: { n: string; label: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="max-w-2xl">
      <p className="font-mono text-[13px] text-comment">
        // {n} · {label}
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
