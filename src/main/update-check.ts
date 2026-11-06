// Notify-only updates. macOS auto-install (Squirrel.Mac / electron-updater) requires a signed app,
// so until Mob Mirror is signed it checks a release feed and offers "Download" (the user installs).
// Feed: package.json "mobMirror.updateRepo" = "owner/repo" (GitHub Releases), or "mobMirror.updateFeed"
// = a URL returning { "version": "1.2.3", "url": "https://…", "notes": "…" }. Unset = no checks.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow, ipcMain, shell } from 'electron'

export interface UpdateInfo {
  current: string
  latest: string | null
  url: string | null
  notes: string | null
  available: boolean
  configured: boolean
  error?: string
}

/** Numeric semver compare (pre-release tags ignored): 1 if a > b, -1 if a < b, 0 if equal. */
export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split(/[.-]/).slice(0, 3).map((n) => Number.parseInt(n, 10) || 0)
  const pb = b.replace(/^v/, '').split(/[.-]/).slice(0, 3).map((n) => Number.parseInt(n, 10) || 0)
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0) ? 1 : -1
  return 0
}

/** The app's own package.json (inside app.asar when packaged). */
function feedConfig(): { updateRepo?: string; updateFeed?: string } {
  try {
    return (JSON.parse(readFileSync(join(app.getAppPath(), 'package.json'), 'utf8')) as { mobMirror?: object }).mobMirror ?? {}
  } catch {
    return {}
  }
}

export async function checkForUpdate(): Promise<UpdateInfo> {
  const current = app.getVersion()
  const cfg = feedConfig()
  const base: UpdateInfo = { current, latest: null, url: null, notes: null, available: false, configured: !!(cfg.updateRepo || cfg.updateFeed) }
  if (!base.configured) return base
  try {
    let latest: string, url: string, notes: string | null
    if (cfg.updateRepo) {
      const r = await fetch(`https://api.github.com/repos/${cfg.updateRepo}/releases/latest`, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'MobMirror-update-check' },
      })
      if (!r.ok) throw new Error(`GitHub: ${r.status}`)
      const j = (await r.json()) as { tag_name: string; html_url: string; body?: string; assets?: { name: string; browser_download_url: string }[] }
      latest = j.tag_name
      url = j.assets?.find((a) => /arm64\.dmg$|\.dmg$/.test(a.name))?.browser_download_url ?? j.html_url
      notes = j.body ?? null
    } else {
      const r = await fetch(cfg.updateFeed!, { headers: { 'User-Agent': 'MobMirror-update-check' } })
      if (!r.ok) throw new Error(`Feed: ${r.status}`)
      const j = (await r.json()) as { version: string; url: string; notes?: string }
      latest = j.version
      url = j.url
      notes = j.notes ?? null
    }
    return { ...base, latest, url, notes, available: compareVersions(latest, current) > 0 }
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message : String(e) }
  }
}

export function registerUpdateIpc(): void {
  ipcMain.handle('update:check', () => checkForUpdate())
  ipcMain.handle('update:download', (_e, url: unknown) => {
    if (typeof url === 'string' && /^https:\/\//.test(url)) void shell.openExternal(url)
  })
  // Quietly once a day (and shortly after launch); the renderer shows a notice when one exists.
  const tick = (): void => {
    void checkForUpdate().then((u) => {
      if (u.available) for (const w of BrowserWindow.getAllWindows()) w.webContents.send('update:available', u)
    })
  }
  setTimeout(tick, 30_000)
  setInterval(tick, 24 * 3600_000)
}
