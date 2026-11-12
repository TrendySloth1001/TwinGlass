import { ArrowRight, ArrowUpRight, Check, Copy } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import changelog from '../data/changelog.json'
import release from '../data/release.json'

export const REPO = release.repo
export const RELEASES = changelog.releases
export const INSTALL = 'curl -fsSL https://raw.githubusercontent.com/TrendySloth1001/TwinGlass/master/install.sh | bash'
export const BREW = 'brew tap TrendySloth1001/tap && brew trust TrendySloth1001/tap\nbrew install --cask twinglass'
export const illo = (name: string) => `/illustrations/${name}.webp`

/** Corner marks on a framed box, drawn on its hairlines (as on Credoodle). */
export function FrameCorners() {
  const corners = ['-top-px -left-px border-t border-l', '-top-px -right-px border-t border-r', '-bottom-px -left-px border-b border-l', '-bottom-px -right-px border-b border-r']
  return corners.map((c) => <span key={c} aria-hidden className={`pointer-events-none absolute size-3.5 border-foreground/60 ${c}`} />)
}

export function Chip({ children, dot = false, className }: { children: ReactNode; dot?: boolean; className?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 font-mono text-[11px] whitespace-nowrap text-muted-foreground ${className ?? ''}`}>
      {dot && <span aria-hidden className="size-1.5 rounded-full bg-mark" />}
      {children}
    </span>
  )
}

/** Credoodle's hover button: a dot that grows to fill it. A button, or a link with href. */
export function HoverButton({ children, onClick, disabled, href }: { children: ReactNode; onClick?: () => void; disabled?: boolean; href?: string }) {
  const cls =
    'group relative inline-flex h-12 items-center overflow-hidden rounded-full border border-foreground/15 bg-background px-6 font-semibold focus-visible:outline-2 focus-visible:outline-mark disabled:cursor-not-allowed disabled:opacity-45'
  const inner = (
    <>
      <span className="flex items-center gap-2.5">
        <span className="size-2 rounded-full bg-foreground transition-transform duration-300 group-enabled:group-hover:scale-[100] group-[:is(a)]:group-hover:scale-[100] motion-reduce:transition-none" />
        <span className="transition-all duration-300 group-enabled:group-hover:translate-x-12 group-enabled:group-hover:opacity-0 group-[:is(a)]:group-hover:translate-x-12 group-[:is(a)]:group-hover:opacity-0 motion-reduce:transition-none">
          {children}
        </span>
      </span>
      <span
        aria-hidden
        className="absolute inset-0 flex translate-x-12 items-center justify-center gap-2 text-background opacity-0 transition-all duration-300 group-enabled:group-hover:translate-x-0 group-enabled:group-hover:opacity-100 group-[:is(a)]:group-hover:translate-x-0 group-[:is(a)]:group-hover:opacity-100 motion-reduce:transition-none"
      >
        {children}
        <ArrowRight className="size-4" />
      </span>
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

export function GhostLink({ href, children }: { href: string; children: ReactNode }) {
  const external = href.startsWith('http')
  return (
    <a
      href={href}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className="inline-flex h-12 items-center gap-1.5 rounded-full px-5 font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {children}
      {external && <ArrowUpRight className="size-4" />}
    </a>
  )
}

export function CopyCommand({ command, label, disabled = false }: { command: string; label: string; disabled?: boolean }) {
  const [done, setDone] = useState(false)
  return (
    <div className={`relative flex items-start gap-3 rounded-xl border border-border bg-tile p-3 pl-4 text-left transition-opacity ${disabled ? 'opacity-50' : ''}`}>
      <span className="mt-1 w-[4.5rem] shrink-0 font-mono text-[11px] text-muted-foreground uppercase">{label}</span>
      <pre className={`min-w-0 flex-1 overflow-x-auto py-0.5 font-mono text-[13px] leading-relaxed whitespace-pre ${disabled ? 'select-none blur-[2px]' : ''}`}>{command}</pre>
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
        className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors enabled:hover:text-foreground disabled:cursor-not-allowed"
      >
        {done ? <Check className="size-4 text-mark" /> : <Copy className="size-4" />}
      </button>
    </div>
  )
}

export function SectionHead({ n, label, title, children }: { n: string; label: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="max-w-2xl">
      <p className="flex items-center gap-2 font-mono text-xs text-muted-foreground uppercase">
        <span className="text-foreground">{n}</span>
        <span aria-hidden className="h-px w-6 bg-border" />
        {label}
      </p>
      <h2 className="font-soft mt-4 text-[2.1rem] leading-[1.08] font-semibold tracking-tight text-balance sm:text-[2.6rem]">{title}</h2>
      {children && <p className="mt-4 text-pretty text-muted-foreground sm:text-lg">{children}</p>}
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
