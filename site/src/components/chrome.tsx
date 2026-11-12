// The site header: a quiet bar with the name, section links, GitHub and Download.
import { Download, Moon, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'
import { GithubMark, REPO } from './base'
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

export function SiteHeader() {
  const { openDownload } = useDownload()
  const links = [
    ['Features', '#features'],
    ['How it works', '#how'],
    ['Phone app', '#phone'],
    ['Agents', '#agents'],
    ['FAQ', '#faq'],
  ]
  const pages = [
    ['Changelog', '/changelog'],
    ['Releases', '/releases'],
  ]
  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 sm:px-6 lg:px-10">
        <a href="/" className="mr-4 flex shrink-0 items-center gap-2 font-semibold text-heading">
          <img src="/icon.png" alt="" className="size-6 rounded-[5px]" />
          Twinglass
        </a>
        <nav aria-label="Main" className="hidden items-center lg:flex">
          {links.map(([label, hash]) => (
            <button key={hash} type="button" onClick={() => go(hash)} className="h-8 rounded-[4px] px-2.5 text-sm text-muted-foreground transition-colors hover:text-heading">
              {label}
            </button>
          ))}
          <span aria-hidden className="mx-1 h-4 w-px bg-border" />
          {pages.map(([label, href]) => (
            <a
              key={href}
              href={href}
              className={`flex h-8 items-center rounded-[4px] px-2.5 text-sm transition-colors hover:text-heading ${window.location.pathname.startsWith(href) ? 'text-heading' : 'text-muted-foreground'}`}
            >
              {label}
            </a>
          ))}
        </nav>
        <span className="ml-auto" />
        <ThemeToggle />
        <a href={REPO} target="_blank" rel="noopener noreferrer" aria-label="GitHub" className=" flex size-9 items-center justify-center rounded-[4px] text-muted-foreground transition-colors hover:text-heading">
          <GithubMark className="size-[18px]" />
        </a>
        <button type="button" onClick={openDownload} className="flex h-8 items-center gap-1.5 rounded-[4px] bg-heading px-3 text-sm font-medium text-background transition-opacity hover:opacity-85">
          <Download className="size-4" />
          Download
        </button>
      </div>
    </header>
  )
}
