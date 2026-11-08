import { Download, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import type { AgentStatusInfo } from '../../../preload/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { SectionHeader } from '@/components/section-header'

type A11y = { app: boolean; enabled: boolean; connected: boolean }

function Line({ label, hint, children }: { label: string; hint: ReactNode; children: ReactNode }): ReactNode {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3">
      <div className="min-w-48 flex-1">
        <div className="text-[13px] font-medium">{label}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function PortField({ port, onSave }: { port: number; onSave: (port: number) => void }): ReactNode {
  const [v, setV] = useState(String(port))
  useEffect(() => setV(String(port)), [port])
  const commit = (): void => {
    const n = Number(v)
    if (n !== port) onSave(n)
  }
  return (
    <Input
      value={v}
      inputMode="numeric"
      onChange={(e) => setV(e.target.value.replace(/[^\d]/g, '').slice(0, 5))}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
      className="h-8 w-28 text-right font-mono text-xs"
    />
  )
}

/**
 * Settings → Agents: where agents work (their own second screen by default), whether they can read
 * any screen (the phone app's accessibility service, per phone), and the opt-in shell tool.
 */
export function AgentOptions(): ReactNode {
  const [status, setStatus] = useState<AgentStatusInfo | null>(null)
  const [phone, setPhone] = useState<{ serial: string; model: string } | null>(null)
  const [a11y, setA11y] = useState<A11y | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const off = window.mobMirror.onAgentStatus(setStatus)
    void window.mobMirror.agentStatus().then(setStatus)
    void window.mobMirror.listDevices().then((l) => {
      const d = l.devices[0]
      if (d?.transports[0]) setPhone({ serial: d.transports[0].serial, model: d.model })
    })
    return off
  }, [])

  const refresh = useCallback(() => {
    if (phone) void window.mobMirror.agentA11yStatus(phone.serial).then(setA11y)
  }, [phone])
  useEffect(refresh, [refresh])

  const setOpt = (o: Parameters<typeof window.mobMirror.setAgentOptions>[0]): void => {
    void window.mobMirror.setAgentOptions(o).then(setStatus)
  }

  const toggleA11y = async (on: boolean): Promise<void> => {
    if (!phone) return
    setBusy(true)
    try {
      if (on && !a11y?.app) await window.mobMirror.companionInstall(phone.serial)
      const now = await window.mobMirror.setAgentA11y(phone.serial, on)
      if (on && !now) toast.error('The phone did not allow it', { description: 'Turn on “Twinglass agent access” in the phone’s Settings → Accessibility.' })
      else toast.success(on ? 'Agents can read any screen' : 'Agent screen reading is off')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
      setTimeout(refresh, 600)
    }
  }

  if (!status) return null
  return (
    <div className="divide-y">
      <Line
        label="Agents work on"
        hint={
          status.workspace === 'agent'
            ? 'Their own second screen of the phone, in a window you can watch. You keep using the phone.'
            : 'The phone’s own screen: you see everything they do on the phone (and they see what you have open).'
        }
      >
        <Select value={status.workspace} onValueChange={(v) => setOpt({ workspace: v as 'agent' | 'phone' })}>
          <SelectTrigger size="sm" className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="agent">Their own second screen</SelectItem>
            <SelectItem value="phone">The phone’s screen</SelectItem>
          </SelectContent>
        </Select>
      </Line>
      <Line
        label="Agents read any screen"
        hint={
          !phone ? (
            'Connect a phone to set this up.'
          ) : (
            <>
              Lets agents see and press exact buttons on {phone.model}, also on their second screen, through the Twinglass phone app’s accessibility
              service. Used only when an agent asks, over your USB or Wi-Fi debugging link.
              {a11y && !a11y.app && ' Installs the phone app first.'}
              {a11y?.enabled && !a11y.connected && ' Switched on, waiting for the phone to start it…'}
            </>
          )
        }
      >
        <div className="flex items-center gap-2">
          {busy && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          {phone && a11y && !a11y.app && !busy ? (
            <Button size="sm" variant="outline" onClick={() => void toggleA11y(true)}>
              <Download /> Install & turn on
            </Button>
          ) : (
            <Switch disabled={!phone || !a11y || busy} checked={a11y?.enabled ?? false} onCheckedChange={(v) => void toggleA11y(v)} />
          )}
        </div>
      </Line>
      {status.workspace === 'agent' && (
        <>
          <Line label="Agent screen size" hint="The size of the agents’ second screen. Tablet is good for testing tablet layouts.">
            <Select value={status.screenSize} onValueChange={(v) => setOpt({ screenSize: v as 'phone' | 'tablet' | 'match' })}>
              <SelectTrigger size="sm" className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="phone">Phone (1080 × 2400)</SelectItem>
                <SelectItem value="match">Same as {phone?.model ?? 'the phone'}</SelectItem>
                <SelectItem value="tablet">Tablet (1600 × 2560)</SelectItem>
              </SelectContent>
            </Select>
          </Line>
          <Line label="Close the agent screen when idle" hint="Its apps move to the phone in the background. It opens again on the next agent action.">
            <Select value={String(status.idleCloseMin)} onValueChange={(v) => setOpt({ idleCloseMin: Number(v) })}>
              <SelectTrigger size="sm" className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Never</SelectItem>
                <SelectItem value="5">After 5 minutes</SelectItem>
                <SelectItem value="15">After 15 minutes</SelectItem>
                <SelectItem value="30">After 30 minutes</SelectItem>
              </SelectContent>
            </Select>
          </Line>
        </>
      )}
      <SectionHeader className="mt-5 mb-1">What agents may do</SectionHeader>
      <Line label="Allow files and installs" hint="Copy files to and from the phone, and install apps from .apk files on this Mac.">
        <Switch checked={status.allowFiles} onCheckedChange={(v) => setOpt({ allowFiles: v })} />
      </Line>
      <Line label="Allow clearing, uninstalling and permission changes" hint="For testing apps: wipe an app’s data, uninstall it, grant or revoke its permissions. Twinglass’ own phone app is always protected.">
        <Switch checked={status.allowAppChanges} onCheckedChange={(v) => setOpt({ allowAppChanges: v })} />
      </Line>
      <Line
        label="Allow changing phone settings"
        hint="Dark mode, font size, animations, screen density, Wi-Fi, mobile data, airplane mode, a fake battery level. Agents are told to put them back; you can too (below)."
      >
        <Switch checked={status.allowDeviceSettings} onCheckedChange={(v) => setOpt({ allowDeviceSettings: v })} />
      </Line>
      <Line label="Allow shell commands" hint="Gives agents a shell tool that runs any adb shell command on the phone (am, pm, settings…). Only turn on for agents you trust.">
        <Switch checked={status.allowShell} onCheckedChange={(v) => setOpt({ allowShell: v })} />
      </Line>
      <SectionHeader className="mt-5 mb-1">Advanced</SectionHeader>
      <Line label="Screenshot size" hint="Long side of agent screenshots. Bigger shows more detail but costs the agent more to read.">
        <Select value={String(status.screenshotMaxDim)} onValueChange={(v) => setOpt({ screenshotMaxDim: Number(v) })}>
          <SelectTrigger size="sm" className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1024">1024 px</SelectItem>
            <SelectItem value="1280">1280 px (default)</SelectItem>
            <SelectItem value="1600">1600 px</SelectItem>
          </SelectContent>
        </Select>
      </Line>
      <Line label="Screenshot quality" hint="JPEG quality. Lower is smaller and faster to send.">
        <Select value={String(status.jpegQuality)} onValueChange={(v) => setOpt({ jpegQuality: Number(v) })}>
          <SelectTrigger size="sm" className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="70">Smaller (70%)</SelectItem>
            <SelectItem value="82">Balanced (82%)</SelectItem>
            <SelectItem value="92">Sharper (92%)</SelectItem>
          </SelectContent>
        </Select>
      </Line>
      <Line label="Server port" hint="Local port of the MCP server. Change it if another app uses it, then copy the setup command again.">
        <PortField port={status.port} onSave={(port) => void window.mobMirror.setAgentPort(port).then(setStatus, (e: unknown) => toast.error(e instanceof Error ? e.message : String(e)))} />
      </Line>
      <Line label="Undo agents’ phone setting changes" hint="Puts back everything agents changed with set_device_state (dark mode, animations, network, battery…).">
        <Button size="sm" variant="outline" disabled={!phone} onClick={() => phone && void window.mobMirror.agentResetDeviceState(phone.serial).then((m) => toast.success(m), (e: unknown) => toast.error(String(e)))}>
          Restore
        </Button>
      </Line>
    </div>
  )
}
