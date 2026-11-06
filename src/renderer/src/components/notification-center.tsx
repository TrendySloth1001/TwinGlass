import { Bell, BellOff, CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { ExpandableText } from '@/components/expandable-text'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  clearNotices,
  dismissNotice,
  markAllRead,
  setNotificationCenterOpen,
  useNotices,
  useNotificationCenter,
  type Notice,
} from '@/lib/notify'
import { cn } from '@/lib/utils'

const ICON: Record<Notice['level'], ReactNode> = {
  info: <Info className="text-muted-foreground" />,
  success: <CircleCheck className="text-success" />,
  warning: <TriangleAlert className="text-warning" />,
  error: <CircleAlert className="text-destructive" />,
}

function ago(at: number): string {
  const s = Math.round((Date.now() - at) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/**
 * Bell + popover listing recent notices, with their actions. In the toolbar it opens below; on the
 * compact control strip it opens to the left (side="left"), beside the strip instead of over it.
 */
export function NotificationCenter({ side = 'bottom' }: { side?: 'bottom' | 'left' }): ReactNode {
  const notices = useNotices()
  const center = useNotificationCenter()
  const unread = notices.filter((n) => !n.read)
  const urgent = unread.some((n) => n.level === 'warning' || n.level === 'error')

  return (
    <Popover
      open={center.open}
      onOpenChange={(open) => {
        setNotificationCenterOpen(open)
        if (open) markAllRead()
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="App notifications" className="relative [-webkit-app-region:no-drag]">
              <Bell />
              {unread.length > 0 && (
                <span
                  className={cn(
                    'absolute top-1 right-1 grid h-3.5 min-w-3.5 place-items-center rounded-full px-0.5 text-[9px] leading-none font-semibold text-white',
                    urgent ? 'bg-destructive' : 'bg-brand',
                  )}
                >
                  {unread.length > 9 ? '9+' : unread.length}
                </span>
              )}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side={side}>App notifications</TooltipContent>
      </Tooltip>
      <PopoverContent
        side={side}
        align="end"
        sideOffset={side === 'left' ? 12 : 8}
        collisionPadding={8}
        // Don't put a focus ring on "Clear all" just because the panel opened.
        onOpenAutoFocus={(e) => e.preventDefault()}
        // Opened from the dark compact strip: match it.
        className={cn('w-[min(20rem,calc(100vw-5rem))] p-0', side === 'left' && 'dark')}
      >
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-[13px] font-semibold">Notifications</span>
          {notices.length > 0 && (
            <Button variant="ghost" size="xs" onClick={clearNotices}>
              Clear all
            </Button>
          )}
        </div>
        {notices.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-xs text-muted-foreground">
            <BellOff className="size-5" />
            You’re all caught up.
          </div>
        ) : (
          <ul className="max-h-[min(22rem,calc(100vh-8rem))] divide-y overflow-y-auto">
            {notices.map((n) => (
              <li key={n.id} className="group flex gap-2 px-3 py-2 [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0">
                {ICON[n.level]}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <ExpandableText text={n.title} lines={1} className="min-w-0 text-[12.5px] leading-tight font-medium" />
                    <button
                      type="button"
                      aria-label="Dismiss"
                      onClick={() => dismissNotice(n.id)}
                      className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                  {n.description && (
                    <ExpandableText text={n.description} defaultOpen={center.focus === n.id} className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground" />
                  )}
                  <div className="mt-1.5 flex items-center gap-2">
                    {n.action && (
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => {
                          n.action!.run()
                          dismissNotice(n.id)
                        }}
                      >
                        {n.action.label}
                      </Button>
                    )}
                    <span className="text-[11px] text-muted-foreground">{ago(n.at)}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}
