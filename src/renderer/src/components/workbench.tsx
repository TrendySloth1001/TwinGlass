// The VS Code-style workbench around the full view: title bar with a command center, activity bar,
// editor tabs. Colours come from the workbench tokens in globals.css (title bar, activity bar, tabs).
import { ArrowDownToLine, Bot, ClipboardList, FlaskConical, Hammer, Ruler, House, Keyboard, Layers, PanelBottom, PanelLeft, Search, Settings, Smartphone, Usb, Wifi, X, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { NotificationCenter } from '@/components/notification-center'
import { Kbd } from '@/components/ui/kbd'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export type SideView = 'phones' | 'tests' | 'build' | 'design' | 'agents'

/** Height of the title bar; the macOS traffic lights are centred in it (see window-layout.ts). */
export const TITLE_BAR = 35

function Tip({ label, shortcut, side = 'bottom', children }: { label: string; shortcut?: string; side?: 'bottom' | 'right' | 'top'; children: ReactNode }): ReactNode {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} className="flex items-center gap-2">
        {label}
        {shortcut && <Kbd>{shortcut}</Kbd>}
      </TooltipContent>
    </Tooltip>
  )
}

/** The window's title bar: traffic lights, the command center in the middle, layout toggles on the right. */
export function TitleBar({
  title,
  onOpenPalette,
  sidebarOpen,
  onToggleSidebar,
  panelOpen,
  onTogglePanel,
  update,
}: {
  /** An update is ready: shown as a pill in the title bar (Mac app, or the phone app on a phone). */
  update?: { label: string; detail: string; onClick: () => void }
  title: string
  onOpenPalette: () => void
  sidebarOpen: boolean
  onToggleSidebar: () => void
  /** The developer panel (log, crashes, performance) under the editor. */
  panelOpen: boolean
  onTogglePanel: () => void
}): ReactNode {
  const toggle = 'flex size-[26px] items-center justify-center rounded-[5px] text-foreground/80 hover:bg-foreground/10 [-webkit-app-region:no-drag] [&_svg]:size-4'
  return (
    <header
      className="relative flex shrink-0 items-center border-b border-border bg-titlebar pr-1.5 pl-[78px] [-webkit-app-region:drag]"
      style={{ height: TITLE_BAR }}
    >
      {/* Command center: VS Code's search box in the title bar. */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <button
          type="button"
          onClick={onOpenPalette}
          className="pointer-events-auto flex h-[22px] w-[38%] max-w-[600px] min-w-[180px] items-center justify-center gap-1.5 rounded-[6px] border border-border-strong bg-foreground/[0.04] px-2 text-[12px] text-muted-foreground transition-colors hover:bg-foreground/[0.08] hover:text-foreground [-webkit-app-region:no-drag]"
        >
          <Search className="size-3.5 shrink-0" />
          <span className="truncate">{title}</span>
        </button>
      </div>
      <div className="relative ml-auto flex items-center gap-0.5">
        {update && (
          <Tip label={update.detail}>
            <button
              type="button"
              onClick={update.onClick}
              className="mr-1.5 flex h-[22px] items-center gap-1 rounded-full bg-primary px-2.5 text-[12px] font-medium text-primary-foreground transition-[filter] hover:brightness-110 [-webkit-app-region:no-drag] [&_svg]:size-3.5"
            >
              <ArrowDownToLine />
              {update.label}
            </button>
          </Tip>
        )}
        <NotificationCenter />
        <Tip label={sidebarOpen ? 'Hide Primary Side Bar' : 'Show Primary Side Bar'} shortcut="⌘\">
          <button type="button" aria-label="Toggle Primary Side Bar" aria-pressed={sidebarOpen} onClick={onToggleSidebar} className={toggle}>
            <PanelLeft className={cn(sidebarOpen && 'fill-foreground/25')} />
          </button>
        </Tip>
        <Tip label={panelOpen ? 'Hide Panel (log, crashes, performance)' : 'Show Panel (log, crashes, performance)'} shortcut="⌘J">
          <button type="button" aria-label="Toggle Panel" aria-pressed={panelOpen} onClick={onTogglePanel} className={toggle}>
            <PanelBottom className={cn(panelOpen && 'fill-foreground/25')} />
          </button>
        </Tip>
      </div>
    </header>
  )
}

function ActivityItem({
  icon: Icon,
  label,
  shortcut,
  active,
  badge,
  onClick,
}: {
  icon: LucideIcon
  label: string
  shortcut?: string
  active?: boolean
  badge?: number
  onClick: () => void
}): ReactNode {
  return (
    <Tip label={label} shortcut={shortcut} side="right">
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        onClick={onClick}
        className={cn(
          'relative flex h-12 w-12 items-center justify-center transition-colors',
          active ? 'text-activity-foreground' : 'text-activity-inactive hover:text-activity-foreground',
        )}
      >
        {/* The active view's indicator: a bar on the left edge. */}
        {active && <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-activity-foreground" />}
        <Icon className="size-6" strokeWidth={1.25} />
        {!!badge && (
          <span className="absolute right-2 bottom-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-badge px-1 text-[9px] font-semibold text-white">
            {badge}
          </span>
        )}
      </button>
    </Tip>
  )
}

/** The activity bar: switches side bar views, plus quick entries and Settings at the bottom. */
export function ActivityBar({
  view,
  sidebarOpen,
  onView,
  phones,
  onSearch,
  onClipboard,
  onSecondScreen,
  onShortcuts,
  onSettings,
}: {
  view: SideView
  sidebarOpen: boolean
  onView: (v: SideView) => void
  phones: number
  onSearch: () => void
  onClipboard: () => void
  onSecondScreen?: () => void
  onShortcuts: () => void
  onSettings: () => void
}): ReactNode {
  return (
    <nav aria-label="Activity bar" className="col-start-1 row-start-2 flex w-12 shrink-0 flex-col border-r border-border bg-activity">
      <ActivityItem icon={Smartphone} label="Phones" shortcut="⌘\" active={sidebarOpen && view === 'phones'} badge={phones} onClick={() => onView('phones')} />
      <ActivityItem icon={Search} label="Open an app on the phone" shortcut="⌘K" onClick={onSearch} />
      <ActivityItem icon={ClipboardList} label="Clipboard history" shortcut="⇧⌘V" onClick={onClipboard} />
      {onSecondScreen && <ActivityItem icon={Layers} label="Second screen" shortcut="⌥⌘N" onClick={onSecondScreen} />}
      <ActivityItem icon={FlaskConical} label="Tests" active={sidebarOpen && view === 'tests'} onClick={() => onView('tests')} />
      <ActivityItem icon={Hammer} label="Build loop" active={sidebarOpen && view === 'build'} onClick={() => onView('build')} />
      <ActivityItem icon={Ruler} label="Design check" active={sidebarOpen && view === 'design'} onClick={() => onView('design')} />
      <ActivityItem icon={Bot} label="Agents" active={sidebarOpen && view === 'agents'} onClick={() => onView('agents')} />
      <div className="mt-auto" />
      <ActivityItem icon={Keyboard} label="Shortcuts & gestures" onClick={onShortcuts} />
      <ActivityItem icon={Settings} label="Settings" shortcut="⌘," onClick={onSettings} />
    </nav>
  )
}

function Tab({
  icon: Icon,
  iconClass,
  label,
  detail,
  active,
  onSelect,
  onClose,
  closeLabel,
}: {
  icon: LucideIcon
  iconClass?: string
  label: string
  detail?: string
  active: boolean
  onSelect: () => void
  onClose?: () => void
  closeLabel?: string
}): ReactNode {
  return (
    <div
      role="tab"
      aria-selected={active}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect()}
      onMouseDown={(e) => {
        // Middle-click closes, like VS Code.
        if (e.button === 1 && onClose) {
          e.preventDefault()
          onClose()
        }
      }}
      className={cn(
        'group relative -mb-px flex max-w-[240px] min-w-0 shrink-0 cursor-default items-center gap-1.5 border-r border-border pr-1.5 pl-3 text-[13px] outline-none',
        active ? 'bg-background text-foreground' : 'bg-tab-inactive text-muted-foreground hover:text-foreground',
      )}
    >
      {active && <span aria-hidden className="absolute inset-x-0 top-0 h-px bg-tab-active-border" />}
      <Icon className={cn('size-4 shrink-0', iconClass)} />
      <span className="truncate">{label}</span>
      {detail && <span className="text-[12px] text-muted-foreground">{detail}</span>}
      {onClose ? (
        <Tip label={closeLabel ?? 'Close'}>
          <button
            type="button"
            aria-label={closeLabel ?? 'Close'}
            onClick={(e) => {
              e.stopPropagation()
              onClose()
            }}
            className={cn('ml-1 flex size-5 items-center justify-center rounded-[4px] hover:bg-foreground/10', !active && 'opacity-0 group-hover:opacity-100')}
          >
            <X className="size-4" />
          </button>
        </Tip>
      ) : (
        <span className="ml-1 size-5" />
      )}
    </div>
  )
}

/** One entry of the editor tab strip. */
export interface EditorTabSpec {
  id: string
  label: string
  kind: 'welcome' | 'settings' | 'usb' | 'wifi' | 'phone' | 'second'
  detail?: string
  /** × on the tab (Disconnect for phones, Close for Settings). */
  onClose?: () => void
  closeLabel?: string
}

const TAB_ICON: Record<EditorTabSpec['kind'], { icon: LucideIcon; cls: string }> = {
  welcome: { icon: House, cls: 'text-primary' },
  settings: { icon: Settings, cls: '' },
  usb: { icon: Usb, cls: 'text-link' },
  wifi: { icon: Wifi, cls: 'text-link' },
  phone: { icon: Smartphone, cls: 'text-link' },
  second: { icon: Layers, cls: 'text-link' },
}

/** The editor tab strip (VS Code's): Welcome, every phone or second screen open here, Settings. */
export function EditorTabs({ tabs, active, onSelect }: { tabs: EditorTabSpec[]; active: string; onSelect: (id: string) => void }): ReactNode {
  return (
    <div role="tablist" className="flex h-[35px] shrink-0 items-stretch overflow-x-auto border-b border-border bg-tab-inactive [scrollbar-width:none]">
      {tabs.map((t) => (
        <Tab
          key={t.id}
          icon={TAB_ICON[t.kind].icon}
          iconClass={TAB_ICON[t.kind].cls}
          label={t.label}
          detail={t.detail}
          active={active === t.id}
          onSelect={() => onSelect(t.id)}
          onClose={t.onClose}
          closeLabel={t.closeLabel}
        />
      ))}
    </div>
  )
}
