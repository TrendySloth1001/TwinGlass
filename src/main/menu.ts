// macOS application menu. Device shortcuts live here because Electron's menu handles key
// equivalents before the page, so ⌘-shortcuts can't be reliably caught with keydown in the renderer.
import { BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron'
import { SHORTCUTS, type ShortcutDef } from '@shared/shortcuts'
import { tileWindows } from './window-layout'

function deviceItems(): MenuItemConstructorOptions[] {
  const items: MenuItemConstructorOptions[] = []
  let group: ShortcutDef['group'] | null = null
  for (const s of SHORTCUTS) {
    if (group && s.group !== group) items.push({ type: 'separator' })
    group = s.group
    items.push({
      label: s.label,
      accelerator: s.accelerator,
      click: () => BrowserWindow.getFocusedWindow()?.webContents.send('device:action', s.action),
    })
  }
  return items
}

const uiCommand = (cmd: string): void => BrowserWindow.getFocusedWindow()?.webContents.send('ui:command', cmd)

export function installMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    {
      role: 'appMenu',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          label: 'Settings…',
          accelerator: 'CommandOrControl+,',
          click: () => BrowserWindow.getFocusedWindow()?.webContents.send('ui:command', 'open-settings'),
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    // Standard edit roles: dialog text fields need them, and on the mirror canvas ⌘V/⌘C/⌘X arrive
    // as paste/copy/cut events, which the input controller bridges to the phone clipboard.
    { role: 'editMenu' },
    { label: 'Device', submenu: deviceItems() },
    {
      label: 'View',
      submenu: [
        {
          label: 'Compact Mirror / Full View',
          accelerator: 'CommandOrControl+Shift+M',
          click: () => BrowserWindow.getFocusedWindow()?.webContents.send('ui:command', 'toggle-view'),
        },
        {
          label: 'Toggle Sidebar',
          accelerator: 'CommandOrControl+\\',
          click: () => BrowserWindow.getFocusedWindow()?.webContents.send('ui:command', 'toggle-sidebar'),
        },
        {
          label: 'Float / Dock Sidebar',
          accelerator: 'CommandOrControl+Alt+\\',
          click: () => BrowserWindow.getFocusedWindow()?.webContents.send('ui:command', 'toggle-sidebar-layout'),
        },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        // No ⌘R here: it rotates the phone. Reload stays available for development.
        { role: 'reload', accelerator: 'CommandOrControl+Alt+R' },
        { role: 'toggleDevTools' },
      ],
    },
    {
      label: 'Phone',
      submenu: [
        { label: 'Open App… / Command Palette', accelerator: 'CommandOrControl+K', click: () => uiCommand('open-palette') },
        { label: 'Clipboard History…', accelerator: 'CommandOrControl+Shift+V', click: () => uiCommand('open-clipboard') },
        { label: 'Send Mac Clipboard to Phone', accelerator: 'CommandOrControl+Shift+O', click: () => uiCommand('send-clipboard') },
        { type: 'separator' },
        { label: 'Show Mac Screen on Phone', accelerator: 'CommandOrControl+Alt+P', click: () => uiCommand('toggle-mac-screen') },
        { label: 'Use Phone as Second Display', accelerator: 'CommandOrControl+Alt+Shift+P', click: () => uiCommand('toggle-extend-display') },
      ],
    },
    {
      role: 'windowMenu',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { label: 'Tile Mirror Windows', accelerator: 'CommandOrControl+Alt+T', click: tileWindows },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
