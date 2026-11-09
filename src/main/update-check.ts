// Updates for Twinglass on the Mac. Electron's auto-updater (Squirrel.Mac) needs a signed app, so
// Twinglass updates itself: it checks GitHub Releases, downloads the DMG, verifies it against the
// release's .sha256, and swaps the app bundle in place (a small detached script waits for this
// process to exit, replaces the bundle with ditto, keeps the old one until the copy succeeded,
// and opens the new one). The feed: package.json "mobMirror.updateRepo" = "owner/repo", or
// "mobMirror.updateFeed" = a URL returning { "version", "url", "notes", "dmg"?, "sha256"? }.
import { spawn, execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { accessSync, constants, createWriteStream, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { app, BrowserWindow, ipcMain, shell } from 'electron'

const run = promisify(execFile)

export interface UpdateInfo {
  current: string
  latest: string | null
  /** The release page (or the feed's URL). */
  url: string | null
  notes: string | null
  available: boolean
  configured: boolean
  /** Can update in place (packaged, the app's folder is writable, the release has a DMG + .sha256). */
  canInstall: boolean
  error?: string
}

export interface UpdateProgress {
  phase: 'downloading' | 'verifying' | 'installing' | 'error'
  /** 0..1 while downloading. */
  progress?: number
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

/** /Applications/Twinglass.app when packaged. */
function bundlePath(): string | null {
  if (!app.isPackaged) return null
  const b = resolve(process.execPath, '../../..')
  return b.endsWith('.app') ? b : null
}

function bundleWritable(): boolean {
  const b = bundlePath()
  if (!b) return false
  try {
    accessSync(dirname(b), constants.W_OK)
    accessSync(b, constants.W_OK)
    return true
  } catch {
    return false
  }
}

let assets: { dmg: string; sha: string } | null = null
let last: UpdateInfo | null = null

export async function checkForUpdate(): Promise<UpdateInfo> {
  const current = app.getVersion()
  const cfg = feedConfig()
  const base: UpdateInfo = {
    current,
    latest: null,
    url: null,
    notes: null,
    available: false,
    canInstall: false,
    configured: !!(cfg.updateRepo || cfg.updateFeed),
  }
  if (!base.configured) return base
  try {
    let latest: string, url: string, notes: string | null
    assets = null
    if (cfg.updateRepo) {
      const r = await fetch(`https://api.github.com/repos/${cfg.updateRepo}/releases/latest`, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Twinglass-update-check' },
      })
      if (!r.ok) throw new Error(`GitHub: ${r.status}`)
      const j = (await r.json()) as { tag_name: string; html_url: string; body?: string; assets?: { name: string; browser_download_url: string }[] }
      latest = j.tag_name.replace(/^v/, '')
      url = j.html_url
      notes = j.body ?? null
      const dmg = j.assets?.find((a) => /arm64\.dmg$/.test(a.name))?.browser_download_url
      const sha = j.assets?.find((a) => /arm64\.dmg\.sha256$/.test(a.name))?.browser_download_url
      if (dmg && sha) assets = { dmg, sha }
    } else {
      const r = await fetch(cfg.updateFeed!, { headers: { 'User-Agent': 'Twinglass-update-check' } })
      if (!r.ok) throw new Error(`Feed: ${r.status}`)
      const j = (await r.json()) as { version: string; url: string; notes?: string; dmg?: string; sha256?: string }
      latest = j.version
      url = j.url
      notes = j.notes ?? null
      if (j.dmg && j.sha256) assets = { dmg: j.dmg, sha: j.sha256 }
    }
    const available = compareVersions(latest, current) > 0
    last = { ...base, latest, url, notes, available, canInstall: available && !!assets && bundleWritable() }
    return last
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message : String(e) }
  }
}

function progress(p: UpdateProgress): void {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('update:progress', p)
}

let installing = false

/** Downloads, verifies and installs the latest release, then relaunches. Throws with a readable message. */
export async function installUpdate(): Promise<void> {
  if (installing) return
  const u = last?.available ? last : await checkForUpdate()
  const dest = bundlePath()
  if (!u.available || !assets) throw new Error('No update to install.')
  if (!dest || !bundleWritable()) throw new Error('Twinglass can’t replace itself in this folder. Download the update instead.')
  installing = true
  const tmp = mkdtempSync(join(tmpdir(), 'twinglass-update-'))
  try {
    // 1. Download with progress.
    progress({ phase: 'downloading', progress: 0 })
    const r = await fetch(assets.dmg, { headers: { 'User-Agent': 'Twinglass-update' } })
    if (!r.ok || !r.body) throw new Error(`Download failed (${r.status})`)
    const total = Number(r.headers.get('content-length')) || 0
    const dmg = join(tmp, 'Twinglass.dmg')
    const file = createWriteStream(dmg)
    const hash = createHash('sha256')
    let got = 0
    let lastSent = 0
    for await (const chunk of r.body as unknown as AsyncIterable<Uint8Array>) {
      hash.update(chunk)
      got += chunk.length
      if (!file.write(chunk)) await new Promise((res) => file.once('drain', res))
      if (total && Date.now() - lastSent > 150) {
        lastSent = Date.now()
        progress({ phase: 'downloading', progress: got / total })
      }
    }
    await new Promise<void>((res, rej) => file.end((e?: Error | null) => (e ? rej(e) : res())))

    // 2. Verify against the published checksum.
    progress({ phase: 'verifying' })
    const s = await fetch(assets.sha, { headers: { 'User-Agent': 'Twinglass-update' } })
    if (!s.ok) throw new Error(`Couldn’t get the checksum (${s.status})`)
    const expected = (await s.text()).trim().split(/\s+/)[0]?.toLowerCase()
    if (!expected || expected !== hash.digest('hex')) throw new Error('The download didn’t match its checksum. Nothing was changed.')

    // 3. Mount and check it really is Twinglass.
    progress({ phase: 'installing' })
    const mnt = join(tmp, 'mnt')
    await run('/usr/bin/hdiutil', ['attach', dmg, '-nobrowse', '-readonly', '-noautoopen', '-mountpoint', mnt, '-quiet'])
    const src = join(mnt, 'Twinglass.app')
    const id = existsSync(src) ? (await run('/usr/libexec/PlistBuddy', ['-c', 'Print CFBundleIdentifier', join(src, 'Contents/Info.plist')])).stdout.trim() : ''
    if (id !== 'app.twinglass.mac') {
      await run('/usr/bin/hdiutil', ['detach', mnt, '-quiet']).catch(() => {})
      throw new Error('The download isn’t a Twinglass app. Nothing was changed.')
    }

    // 4. Swap after this process exits; restore the old app if the copy fails; relaunch.
    const script = join(tmp, 'swap.sh')
    writeFileSync(
      script,
      `#!/bin/sh
PID="$1"; SRC="$2"; DEST="$3"; MNT="$4"; TMP="$5"
i=0; while kill -0 "$PID" 2>/dev/null && [ $i -lt 240 ]; do sleep 0.25; i=$((i+1)); done
rm -rf "$DEST.updating-old"
if mv "$DEST" "$DEST.updating-old" && /usr/bin/ditto "$SRC" "$DEST"; then
  rm -rf "$DEST.updating-old"
else
  rm -rf "$DEST"; mv "$DEST.updating-old" "$DEST"
fi
/usr/bin/xattr -dr com.apple.quarantine "$DEST" 2>/dev/null
/usr/bin/hdiutil detach "$MNT" -quiet
/usr/bin/env -u ELECTRON_RUN_AS_NODE /usr/bin/open "$DEST"
rm -rf "$TMP"
`,
      { mode: 0o700 },
    )
    spawn('/bin/sh', [script, String(process.pid), src, dest, mnt, tmp], { detached: true, stdio: 'ignore' }).unref()
    app.quit()
    setTimeout(() => app.exit(0), 4000) // windows that refuse to close don't block the update
  } catch (e) {
    installing = false
    const error = e instanceof Error ? e.message : String(e)
    progress({ phase: 'error', error })
    throw new Error(error)
  }
}

export function registerUpdateIpc(): void {
  ipcMain.handle('update:check', () => checkForUpdate())
  ipcMain.handle('update:install', () => installUpdate())
  ipcMain.handle('update:download', (_e, url: unknown) => {
    if (typeof url === 'string' && /^https:\/\//.test(url)) void shell.openExternal(url)
  })
  // Shortly after launch, then every 6 hours; the renderer offers it once per version.
  const tick = (): void => {
    void checkForUpdate().then((u) => {
      if (u.available) for (const w of BrowserWindow.getAllWindows()) w.webContents.send('update:available', u)
    })
  }
  setTimeout(tick, 20_000)
  setInterval(tick, 6 * 3600_000)
}
