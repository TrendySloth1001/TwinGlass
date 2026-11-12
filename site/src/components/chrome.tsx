// The site header: a quiet bar with the name, section links, GitHub and Download.
import { Download } from 'lucide-react'
import { GithubMark, REPO } from './base'
import { useDownload } from './download'

function go(hash: string) {
  if (window.location.pathname !== '/') window.location.href = `/${hash}`
  else document.querySelector(hash)?.scrollIntoView({ behavior: 'smooth' })
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
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 sm:px-6 lg:px-10">
        <a href="/" className="mr-4 flex shrink-0 items-center gap-2 font-semibold text-heading">
          <img src="/icon.png" alt="" className="size-6 rounded-[5px]" />
          Twinglass
        </a>
        <nav aria-label="Main" className="hidden items-center md:flex">
          {links.map(([label, hash]) => (
            <button key={hash} type="button" onClick={() => go(hash)} className="h-8 rounded-[4px] px-2.5 text-sm text-muted-foreground transition-colors hover:text-heading">
              {label}
            </button>
          ))}
        </nav>
        <a href={REPO} target="_blank" rel="noopener noreferrer" aria-label="GitHub" className="ml-auto flex size-9 items-center justify-center rounded-[4px] text-muted-foreground transition-colors hover:text-heading">
          <GithubMark className="size-[18px]" />
        </a>
        <button type="button" onClick={openDownload} className="flex h-9 items-center gap-1.5 rounded-[4px] bg-primary px-4 text-sm font-medium text-white transition-colors hover:bg-primary-hover">
          <Download className="size-4" />
          Download
        </button>
      </div>
    </header>
  )
}
