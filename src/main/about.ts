// Settings → About: version details and the project's links. Links are a fixed set (the renderer
// can't make the main process open arbitrary URLs).
import { arch, release } from 'node:os'
import { app, ipcMain, shell } from 'electron'
import { SCRCPY_VERSION } from '@shared/scrcpy/constants'
import { bundledPhoneApp } from './bundled-phone-app'

export const REPO_URL = 'https://github.com/TrendySloth1001/TwinGlass'

export interface AboutInfo {
  version: string
  electron: string
  chrome: string
  node: string
  macos: string
  arch: string
  scrcpy: string
  phoneApp: string | null
  packaged: boolean
}

export type AboutLink = 'repo' | 'releases' | 'issues' | 'new-issue' | 'changelog' | 'scrcpy' | 'figma-tokens'

function about(): AboutInfo {
  return {
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    macos: process.getSystemVersion?.() ?? release(),
    arch: arch(),
    scrcpy: SCRCPY_VERSION,
    phoneApp: bundledPhoneApp()?.version ?? null,
    packaged: app.isPackaged,
  }
}

/** A new issue, pre-filled with versions only (nothing personal; the user sees it before sending). */
function newIssueUrl(): string {
  const a = about()
  const body = [
    '**What happened**',
    '',
    '',
    '**What you expected**',
    '',
    '',
    '**Steps to reproduce**',
    '1. ',
    '',
    '---',
    `Twinglass ${a.version} · phone app ${a.phoneApp ?? '—'} · macOS ${a.macos} (${a.arch}) · Electron ${a.electron} · scrcpy-server ${a.scrcpy}`,
  ].join('\n')
  return `${REPO_URL}/issues/new?body=${encodeURIComponent(body)}`
}

const LINKS: Record<AboutLink, () => string> = {
  repo: () => REPO_URL,
  releases: () => `${REPO_URL}/releases`,
  issues: () => `${REPO_URL}/issues`,
  'new-issue': newIssueUrl,
  changelog: () => `${REPO_URL}/blob/master/CHANGELOG.md`,
  scrcpy: () => 'https://github.com/Genymobile/scrcpy',
  'figma-tokens': () => 'https://help.figma.com/hc/en-us/articles/8085703771159-Manage-personal-access-tokens',
}

export function registerAboutIpc(): void {
  ipcMain.handle('about:info', () => about())
  ipcMain.handle('about:open', (_e, which: unknown) => {
    const url = typeof which === 'string' && which in LINKS ? LINKS[which as AboutLink]() : null
    if (url) void shell.openExternal(url)
  })
}
