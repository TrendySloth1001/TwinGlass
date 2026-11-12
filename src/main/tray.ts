// Menu bar icon: phones with battery and connection, one click to mirror, launch at login.
import { hostWindowOf } from './tabs'
import { app, BrowserWindow, Menu, nativeImage, Tray, webContents, type MenuItemConstructorOptions } from 'electron'
import type { Adb, DeviceList } from './adb/adb'
import { parseBattery, type Battery } from './adb/parse'
import { onDevicesChanged, trackDevices } from './devices-ipc'
import { mirroredSerials } from './session-ipc'
import { TRAY_ICON_1X, TRAY_ICON_2X } from './tray-icon'
import { tileWindows } from './window-layout'

let tray: Tray | null = null
let devices: DeviceList | null = null
const battery = new Map<string, Battery>()

interface TrayDeps {
  getAdb: () => Adb | null
  /** Show (or create) a window and start mirroring this transport there. */
  mirror: (t: { serial: string; kind: 'usb' | 'wifi' }) => void
  showApp: () => void
}

async function refreshBattery(adb: Adb): Promise<void> {
  for (const d of devices?.devices ?? []) {
    const t = d.transports[0]
    if (!t) continue
    const b = parseBattery(await adb.runLoose(['shell', 'dumpsys battery'], t.serial, 5000))
    if (b) battery.set(d.id, b)
  }
}

function build(deps: TrayDeps): void {
  if (!tray) return
  const live = mirroredSerials()
  const items: MenuItemConstructorOptions[] = []
  const list = devices?.devices ?? []
  if (!list.length) items.push({ label: 'No phone connected', enabled: false })
  for (const d of list) {
    const b = battery.get(d.id)
    const t = d.transports[0]
    const mirroredOn = d.transports.find((x) => live.has(x.serial))
    const status = [b ? `${b.level}%${b.charging ? ' ⚡' : ''}` : null, t ? (t.kind === 'usb' ? 'USB' : 'Wi-Fi') : null].filter(Boolean).join(' · ')
    items.push({ label: `${d.model}${status ? `  —  ${status}` : ''}`, enabled: false })
    if (mirroredOn) {
      items.push({
        label: 'Show mirror',
        click: () => {
          const wc = webContents.fromId(live.get(mirroredOn.serial)!)
          const win = wc && (BrowserWindow.fromWebContents(wc) ?? hostWindowOf(wc))
          win?.show()
          win?.focus()
        },
      })
    } else if (t) {
      items.push({ label: `Mirror over ${t.kind === 'usb' ? 'USB' : 'Wi-Fi'}`, click: () => deps.mirror({ serial: t.serial, kind: t.kind }) })
    }
    items.push({ type: 'separator' })
  }
  if (devices?.other.length) {
    for (const o of devices.other) items.push({ label: `${o.serial}: ${o.state === 'unauthorized' ? 'tap Allow on the phone' : o.state}`, enabled: false })
    items.push({ type: 'separator' })
  }
  items.push(
    { label: 'Show Twinglass', click: deps.showApp },
    { label: 'Tile Mirror Windows', click: tileWindows, enabled: BrowserWindow.getAllWindows().length > 1 },
    { type: 'separator' },
    {
      label: 'Launch at Login',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (mi) => app.setLoginItemSettings({ openAtLogin: mi.checked }),
    },
    { label: 'Quit Twinglass', role: 'quit' },
  )
  tray.setContextMenu(Menu.buildFromTemplate(items))
  const first = list[0] && battery.get(list[0].id)
  tray.setToolTip(list.length ? `Twinglass: ${list.map((d) => d.model).join(', ')}` : 'Twinglass: no phone')
  tray.setTitle(first ? ` ${first.level}%` : '') // battery next to the icon, like the Mac's own
}

export function setTrayVisible(on: boolean, deps: TrayDeps): void {
  if (!on) {
    tray?.destroy()
    tray = null
    return
  }
  if (tray) return
  const img = nativeImage.createFromDataURL(TRAY_ICON_1X)
  img.addRepresentation({ scaleFactor: 2, dataURL: TRAY_ICON_2X })
  img.setTemplateImage(true)
  tray = new Tray(img)
  tray.on('mouse-enter', () => build(deps)) // fresh "mirroring" state when the menu is about to open
  const adb = deps.getAdb()
  if (adb) {
    void trackDevices(adb).then(async (l) => {
      devices = l
      await refreshBattery(adb)
      build(deps)
    })
  }
  build(deps)
}

/** Once at startup: device changes and a battery refresh every minute keep the menu current. */
export function startTrayUpdates(deps: TrayDeps): void {
  onDevicesChanged((l) => {
    devices = l
    const adb = deps.getAdb()
    void (adb ? refreshBattery(adb) : Promise.resolve()).then(() => build(deps))
  })
  setInterval(() => {
    const adb = deps.getAdb()
    if (tray && adb) void refreshBattery(adb).then(() => build(deps))
  }, 60_000)
}
