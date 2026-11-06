/// <reference path="../../preload/api.d.ts" />
import { AndroidKey } from '@shared/input/keycodes'
import { collapsePanels, expandNotificationPanel, rotateDevice, setDisplayPower } from '@shared/scrcpy/control'
import { QualityPreset, type MainToRenderer, type RendererToMain } from '@shared/ipc'
import type { DeviceInfo, DeviceListInfo, OpResult, TransportInfo } from '../../preload/api'
import { setupAddDevice } from './add-device'
import { InputController } from './input'
import { VideoView } from './video-view'

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T
const list = $('devices')
const adbLabel = $('adb')
const toolbar = $('toolbar')
const deviceName = $('device-name')
const canvas = $<HTMLCanvasElement>('screen')
const placeholder = $('placeholder')
const status = $('status')

interface Active {
  port: MessagePort
  video: VideoView
  input: InputController
  statsTimer: number
  screenOff: boolean
}
let active: Active | null = null
let connecting = false

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, cls?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  if (text) e.textContent = text
  if (cls) e.className = cls
  return e
}

function setStatus(text: string, error = false): void {
  status.textContent = text
  status.classList.toggle('error', error)
}

function render({ devices, other }: DeviceListInfo): void {
  list.replaceChildren()
  if (devices.length === 0 && other.length === 0) {
    list.append(el('li', 'No devices. Plug in a phone with USB debugging on, or add a wireless device.', 'muted'))
  }
  for (const d of devices) list.append(deviceItem(d))
  for (const t of other) {
    const hint =
      t.state === 'unauthorized'
        ? ' (accept the "Allow USB debugging?" prompt on the phone)'
        : t.state === 'offline'
          ? ' (unlock the phone, or replug / re-enable wireless debugging)'
          : ''
    list.append(el('li', `${t.serial}: ${t.state}${hint}`, 'muted'))
  }
}

async function refresh(): Promise<void> {
  try {
    render(await window.mobMirror.listDevices())
  } catch (e) {
    list.replaceChildren(el('li', String(e), 'error'))
  }
}

async function showAdbStatus(): Promise<void> {
  const s = await window.mobMirror.adbStatus()
  if (!s.adbPath) {
    adbLabel.textContent = 'adb not found. Install it with: brew install android-platform-tools'
    return
  }
  adbLabel.textContent = `adb ${s.clientVersion ?? '?'} · ${s.adbPath}`
  const warn = $('adb-warning')
  if (s.serverVersion && s.clientVersion && s.serverVersion !== s.clientVersion) {
    warn.textContent =
      `The running adb server is ${s.serverVersion} (${s.serverPath ?? 'another install'}), ` +
      `but this app uses adb ${s.clientVersion}. Another tool probably started it. ` +
      'If wireless pairing misbehaves, quit that tool and run "adb kill-server".'
    warn.hidden = false
  } else warn.hidden = true
}

/** Runs a device action from a button, showing the outcome in the status bar. */
async function action(btn: HTMLButtonElement, label: string, run: () => Promise<OpResult>): Promise<void> {
  btn.disabled = true
  setStatus(`${label}…`)
  try {
    const r = await run()
    setStatus(r.ok ? `${label}: ${r.message}` : `${label} failed: ${r.message}`, !r.ok)
  } catch (e) {
    setStatus(`${label} failed: ${e}`, true)
  } finally {
    btn.disabled = false
  }
}

function deviceItem(d: DeviceInfo): HTMLLIElement {
  const li = el('li', undefined, 'device')
  const android = d.sdk ? ` · API ${d.sdk}` : ''
  li.append(el('div', `${d.model}${android}`, 'model'))
  const hasWifi = d.transports.some((t) => t.kind === 'wifi')
  d.transports.forEach((t, i) => {
    const row = el('div', undefined, 'transport')
    row.append(el('span', `${t.kind === 'usb' ? 'USB' : 'Wi-Fi'} · ${t.serial}`))
    const actions = el('div', undefined, 'actions')
    if (t.kind === 'usb' && !hasWifi) {
      const wifi = el('button', 'Wi-Fi', 'small')
      wifi.title = 'Switch this phone to Wi-Fi (adb tcpip 5555). Unencrypted; meant for Android 10 and older.'
      wifi.addEventListener('click', () => void action(wifi, 'Enabling Wi-Fi', () => window.mobMirror.enableTcpip(t.serial)))
      actions.append(wifi)
    }
    if (t.kind === 'wifi' && /^[\d.]+:\d+$/.test(t.serial)) {
      const forget = el('button', '✕', 'small')
      forget.title = 'Disconnect this Wi-Fi connection'
      forget.addEventListener('click', () => void action(forget, 'Disconnecting', () => window.mobMirror.disconnect(t.serial)))
      actions.append(forget)
    }
    const btn = el('button', 'Mirror', i === 0 ? 'primary' : undefined)
    btn.addEventListener('click', () => void connect(t))
    actions.append(btn)
    row.append(actions)
    li.append(row)
  })
  return li
}

function waitForPort(): Promise<{ port: MessagePort; deviceName: string }> {
  return new Promise((resolve) => {
    const onMessage = (e: MessageEvent): void => {
      if (e.source !== window || e.data?.type !== 'mob-mirror:session-port' || !e.ports[0]) return
      window.removeEventListener('message', onMessage)
      resolve({ port: e.ports[0], deviceName: e.data.deviceName as string })
    }
    window.addEventListener('message', onMessage)
  })
}

async function connect(t: TransportInfo): Promise<void> {
  if (connecting) return
  connecting = true
  teardown()
  setStatus(`Connecting to ${t.serial}…`)
  try {
    const portPromise = waitForPort()
    await window.mobMirror.startSession({ serial: t.serial, ...QualityPreset[t.kind] })
    const { port, deviceName: name } = await portPromise
    start(port, name, t)
  } catch (e) {
    setStatus(`Could not start mirroring: ${e instanceof Error ? e.message : e}`, true)
  } finally {
    connecting = false
  }
}

function start(port: MessagePort, name: string, t: TransportInfo): void {
  const send = (data: Uint8Array): void => port.postMessage({ t: 'control', data } satisfies RendererToMain)
  const video = new VideoView(
    canvas,
    (e) => setStatus(`Video error: ${e.message}`, true),
    () => {},
  )
  const input = new InputController(canvas, () => video.size, send, () => window.mobMirror.readClipboard())

  port.onmessage = ({ data }: MessageEvent<MainToRenderer>) => {
    if (data.t === 'video') video.handle(data.ev)
    else if (data.t === 'log') console.debug('[scrcpy]', data.line.trimEnd())
    else if (data.t === 'closed') {
      teardown()
      setStatus(data.error ? `Disconnected: ${data.error}` : 'Disconnected', !!data.error)
    }
  }
  port.start()

  const statsTimer = window.setInterval(() => {
    const s = video.stats()
    setStatus(
      `${t.kind === 'usb' ? 'USB' : 'Wi-Fi'} · ${s.width}×${s.height} · ${s.fps} fps · ${s.codec ?? '…'} · ${s.hardware} decode`,
    )
  }, 1000)

  active = { port, video, input, statsTimer, screenOff: false }
  deviceName.textContent = name
  toolbar.hidden = false
  placeholder.hidden = true
  canvas.focus()
}

function teardown(): void {
  if (!active) return
  const a = active
  active = null
  clearInterval(a.statsTimer)
  a.input.dispose()
  a.video.dispose()
  a.port.postMessage({ t: 'stop' } satisfies RendererToMain)
  a.port.close()
  toolbar.hidden = true
  placeholder.hidden = false
}

toolbar.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest('button')
  if (!btn || !active) return
  const send = (data: Uint8Array): void => active!.port.postMessage({ t: 'control', data } satisfies RendererToMain)
  const key = btn.dataset.key as keyof typeof AndroidKey | undefined
  if (key) active.input.pressKey(AndroidKey[key])
  switch (btn.dataset.action) {
    case 'notifications':
      send(expandNotificationPanel())
      break
    case 'collapse':
      send(collapsePanels())
      break
    case 'rotate':
      send(rotateDevice())
      break
    case 'screen-off':
      active.screenOff = !active.screenOff
      send(setDisplayPower(!active.screenOff))
      break
    case 'disconnect':
      teardown()
      void window.mobMirror.stopSession()
      setStatus('Disconnected')
      break
  }
  canvas.focus()
})

$('refresh').addEventListener('click', () => void refresh())
window.mobMirror.onDevicesChanged(render)
setupAddDevice()
void showAdbStatus()
void refresh()
