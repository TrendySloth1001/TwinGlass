import { toast } from 'sonner'
import type { UpdateInfo } from '../../../preload/api'

/**
 * Installs a Twinglass update in place with a progress toast; the app relaunches by itself. Falls
 * back to opening the release page when it can't replace itself (e.g. a folder it can't write).
 */
export function startUpdate(u: UpdateInfo): void {
  if (!u.canInstall) {
    if (u.url) void window.mobMirror.downloadUpdate(u.url)
    return
  }
  const id = toast.loading(`Downloading Twinglass ${u.latest}…`, { duration: Infinity })
  const off = window.mobMirror.onUpdateProgress((p) => {
    if (p.phase === 'downloading') toast.loading(`Downloading Twinglass ${u.latest}… ${Math.round((p.progress ?? 0) * 100)}%`, { id })
    else if (p.phase === 'verifying') toast.loading('Checking the download…', { id })
    else if (p.phase === 'installing') toast.loading('Installing. Twinglass will reopen in a moment.', { id })
  })
  window.mobMirror.installUpdate().catch((e: unknown) => {
    off()
    toast.error('Update failed', { id, duration: 10_000, description: e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e) })
  })
}
