// Build loop: point at your build's output folder; each new APK installs on the phone in front, the app
// restarts, and a recorded test can replay on a second screen. Plus the command line tool for CI.
import { Check, Copy, FolderOpen, Loader2, Play, Square, Upload } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import type { BuildEvent, BuildLoopStatus } from '../../../main/build-loop'
import type { SavedTest } from '../../../shared/tests'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

const clean = (e: unknown): string => (e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e))
const PHASE_CLASS: Record<BuildEvent['phase'], string> = {
  waiting: 'text-muted-foreground',
  installing: 'text-foreground',
  installed: 'text-foreground',
  launched: 'text-foreground',
  testing: 'text-foreground',
  passed: 'text-success',
  failed: 'text-destructive',
  error: 'text-destructive',
}
const time = (at: number): string => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

export function BuildView({ target }: { target: { serial: string; name: string } | null }): ReactNode {
  const [status, setStatus] = useState<BuildLoopStatus | null>(null)
  const [tests, setTests] = useState<SavedTest[]>([])
  const [busy, setBusy] = useState(false)
  const [cli, setCli] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    void window.mobMirror.build.status().then(setStatus, () => {})
    void window.mobMirror.tests.list().then(setTests, () => {})
    void window.mobMirror.build.cliPath().then(setCli, () => {})
    return window.mobMirror.build.onEvent((e) => {
      setStatus((s) => (s ? { ...s, events: [...s.events.slice(-49), e] } : s))
      if (e.phase === 'failed' || e.phase === 'error') toast.error(e.message)
      if (e.phase === 'passed') toast.success(e.message)
    })
  }, [])

  const act = async (fn: () => Promise<BuildLoopStatus>): Promise<void> => {
    try {
      setStatus(await fn())
    } catch (e) {
      toast.error(clean(e))
    }
  }
  const installNow = async (): Promise<void> => {
    if (!target) return
    setBusy(true)
    await act(() => window.mobMirror.build.installNow(target.serial))
    setBusy(false)
  }
  const installCmd = cli ? `sudo ln -sf "${cli}" /usr/local/bin/twinglass` : ''
  const folder = status?.config.folder

  return (
    <div className="flex flex-col gap-3 px-3 pt-1 pb-3 text-[12px]">
      <p className="leading-snug text-muted-foreground">
        Every time your build writes a new APK (Gradle, Flutter, React Native), it’s installed on {target ? target.name : 'the phone'}, the app restarts, and a test can
        run.
      </p>

      <div className="flex flex-col gap-1">
        <span className="label-mono">Build output folder</span>
        <button
          type="button"
          onClick={() => void act(() => window.mobMirror.build.chooseFolder())}
          className="flex items-center gap-2 rounded-[2px] border border-input bg-input-background px-2 py-1.5 text-left hover:border-primary/60"
          title={folder ?? undefined}
        >
          <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
          <span className={cn('min-w-0 flex-1 truncate', !folder && 'text-muted-foreground')} dir={folder ? 'rtl' : undefined}>
            {folder ?? 'Choose… (e.g. app/build/outputs/apk)'}
          </span>
        </button>
      </div>

      <div className="flex flex-col gap-1">
        <span className="label-mono">After installing, run</span>
        <Select value={status?.config.test ?? 'none'} onValueChange={(v) => void act(() => window.mobMirror.build.setTest(v === 'none' ? null : v))}>
          <SelectTrigger size="sm" className="w-full">
            <SelectValue>{status?.config.test ?? 'No test'}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No test</SelectItem>
            {tests.map((t) => (
              <SelectItem key={t.name} value={t.name}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-1.5">
        {status?.running ? (
          <Button size="sm" variant="secondary" className="flex-1" onClick={() => void act(() => window.mobMirror.build.stop())}>
            <Square /> Stop watching
          </Button>
        ) : (
          <Button size="sm" className="flex-1" disabled={!folder || !target} onClick={() => target && void act(() => window.mobMirror.build.start(target.serial))}>
            <Play /> {target ? 'Watch for builds' : 'Connect a phone first'}
          </Button>
        )}
        <Button size="sm" variant="secondary" disabled={!folder || !target || busy} title="Install the newest APK in the folder now" onClick={() => void installNow()}>
          {busy ? <Loader2 className="animate-spin" /> : <Upload />} Install now
        </Button>
      </div>

      {!!status?.events.length && (
        <ul className="flex max-h-56 flex-col gap-0.5 overflow-auto rounded-[4px] border border-border px-2 py-1.5 font-mono text-[11px]">
          {status.events
            .slice()
            .reverse()
            .map((e, i) => (
              <li key={i} className={cn('flex gap-2', PHASE_CLASS[e.phase])}>
                <span className="shrink-0 text-muted-foreground">{time(e.at)}</span>
                <span className="min-w-0 break-words">{e.message}</span>
              </li>
            ))}
        </ul>
      )}

      <section className="flex flex-col gap-1.5 border-t border-border pt-2">
        <span className="label-mono">Command line</span>
        <p className="leading-snug text-muted-foreground">
          Run your recorded tests from a terminal or CI script on this Mac (with agent access on). <code className="font-mono">twinglass test run "Login"</code> exits 1
          when it fails; <code className="font-mono">twinglass audit</code> checks accessibility.
        </p>
        {cli && (
          <button
            type="button"
            onClick={() =>
              void navigator.clipboard.writeText(installCmd).then(() => {
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              })
            }
            className="flex items-start gap-2 rounded-[2px] border border-border bg-foreground/[0.04] px-2 py-1.5 text-left font-mono text-[11px] hover:border-primary/60"
            title="Copy: run it in Terminal once to install the twinglass command"
          >
            <span className="min-w-0 flex-1 break-all">{installCmd}</span>
            {copied ? <Check className="size-3.5 shrink-0 text-success" /> : <Copy className="size-3.5 shrink-0 text-muted-foreground" />}
          </button>
        )}
      </section>
    </div>
  )
}
