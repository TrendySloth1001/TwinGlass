/// <reference path="../../preload/api.d.ts" />
const list = document.getElementById('devices')!
const adbLabel = document.getElementById('adb')!

function el(tag: string, text?: string, cls?: string): HTMLElement {
  const e = document.createElement(tag)
  if (text) e.textContent = text
  if (cls) e.className = cls
  return e
}

async function refresh(): Promise<void> {
  list.replaceChildren()
  try {
    const { adbPath } = await window.mobMirror.adbStatus()
    adbLabel.textContent = adbPath ? `adb: ${adbPath}` : 'adb not found'
    const { devices, other } = await window.mobMirror.listDevices()
    if (devices.length === 0 && other.length === 0) list.append(el('li', 'No devices. Enable USB or wireless debugging.', 'muted'))
    for (const d of devices) {
      const li = el('li', d.model)
      for (const t of d.transports) li.append(el('span', `${t.kind} · ${t.serial}`, 'tag'))
      list.append(li)
    }
    for (const t of other) list.append(el('li', `${t.serial}: ${t.state}`, 'muted'))
  } catch (e) {
    list.append(el('li', String(e), 'error'))
  }
}

document.getElementById('refresh')!.addEventListener('click', () => void refresh())
void refresh()
