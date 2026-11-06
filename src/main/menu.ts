// macOS application menu. Device shortcuts live here because Electron's menu handles key
// equivalents before the page, so ⌘-shortcuts can't be reliably caught with keydown in the renderer.
import { BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron'
import { SHORTCUTS, type ShortcutDef } from '@shared/shortcuts'

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

export function installMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    { role: 'appMenu' },
    // Standard edit roles: dialog text fields need them, and on the mirror canvas ⌘V/⌘C/⌘X arrive
    // as paste/copy/cut events, which the input controller bridges to the phone clipboard.
    { role: 'editMenu' },
    { label: 'Device', submenu: deviceItems() },
    {
      label: 'View',
      submenu: [
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
    { role: 'windowMenu' },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
