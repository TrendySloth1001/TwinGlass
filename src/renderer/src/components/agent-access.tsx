import { Bot, Copy, RefreshCw, TriangleAlert } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import type { AgentStatusInfo } from '../../../preload/api'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

/** Sidebar section: lets coding agents (Claude Code, Cursor…) control the phone over local MCP. */
export function AgentAccess(): ReactNode {
  const [status, setStatus] = useState<AgentStatusInfo | null>(null)

  useEffect(() => {
    const off = window.mobMirror.onAgentStatus(setStatus) // changes from other windows / main
    void window.mobMirror.agentStatus().then(setStatus)
    return off
  }, [])

  const toggle = async (enabled: boolean): Promise<void> => {
    const s = await window.mobMirror.setAgentEnabled(enabled)
    setStatus(s)
    if (s.error) toast.error('Agent access could not start', { description: s.error })
    else if (enabled) toast.success('Agent access on', { description: 'Copy the setup command into a terminal once.' })
  }

  const copy = async (): Promise<void> => {
    await window.mobMirror.copyAgentSetup()
    toast.success('Setup command copied', {
      description: 'Paste it in a terminal to add Twinglass to Claude Code (contains your access token).',
    })
  }

  const regenerate = async (): Promise<void> => {
    setStatus(await window.mobMirror.regenerateAgentToken())
    toast.success('New token created and copied', { description: 'Agents using the old token are now locked out.' })
  }

  const on = status?.enabled === true
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="agent-access" className="flex items-center gap-1.5 text-xs font-normal">
          <Bot className="size-3.5" /> Agent access (MCP)
        </Label>
        <Switch id="agent-access" checked={on} onCheckedChange={(v) => void toggle(v)} />
      </div>
      {on && status && (
        <>
          <p className={cn('text-[11px]', status.running ? 'text-muted-foreground' : 'text-destructive')}>
            {status.running ? (
              <>Listening on {status.url} (this Mac only)</>
            ) : (
              <span className="flex items-center gap-1">
                <TriangleAlert className="size-3" /> {status.error ?? 'Not running'}
              </span>
            )}
          </p>
          <div className="flex gap-1.5">
            <Button size="xs" variant="outline" className="flex-1" onClick={() => void copy()}>
              <Copy /> Copy Claude Code setup
            </Button>
            <Button size="icon-xs" variant="ghost" aria-label="New access token" title="New access token" onClick={() => void regenerate()}>
              <RefreshCw />
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
