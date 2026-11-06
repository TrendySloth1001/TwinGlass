/// <reference path="../../preload/api.d.ts" />
// "Add a wireless device" dialog: QR pairing, pairing-code pairing, connect by address.
import type { OpResult } from '../../preload/api'

const $ = <T extends HTMLElement>(sel: string, root: ParentNode = document): T => root.querySelector(sel) as T

export function setupAddDevice(): void {
  const dialog = $<HTMLDialogElement>('#add-dialog')
  const tabs = [...dialog.querySelectorAll<HTMLButtonElement>('[role=tab]')]
  const qrBox = $('#qr-box')
  const qrStatus = $('#qr-status')
  let unsubscribeQr: (() => void) | null = null

  const show = (msg: string, el: HTMLElement, kind: 'muted' | 'ok' | 'error' = 'muted'): void => {
    el.textContent = msg
    el.className = kind
  }

  async function startQr(): Promise<void> {
    stopQr()
    qrBox.textContent = 'Generating…'
    show('', qrStatus)
    unsubscribeQr = window.mobMirror.onQrState((s) => {
      if (s.state === 'waiting') show('Waiting for the phone to scan the code…', qrStatus)
      else if (s.state === 'pairing') show(`Found the phone at ${s.hostPort}. Pairing…`, qrStatus)
      else if (s.state === 'paired') {
        show('Paired. The phone will appear in the device list in a moment.', qrStatus, 'ok')
        setTimeout(() => dialog.open && dialog.close(), 2500)
      } else show(s.message, qrStatus, 'error')
    })
    try {
      const { svg } = await window.mobMirror.startQrPairing()
      // The SVG comes from our own main process (the qrcode library), not from the network.
      qrBox.innerHTML = svg
    } catch (e) {
      qrBox.textContent = ''
      show(String(e), qrStatus, 'error')
    }
  }

  function stopQr(): void {
    unsubscribeQr?.()
    unsubscribeQr = null
    void window.mobMirror.cancelQrPairing()
  }

  function selectTab(name: string): void {
    for (const t of tabs) t.setAttribute('aria-selected', String(t.dataset.tab === name))
    for (const p of dialog.querySelectorAll<HTMLElement>('[data-panel]')) p.hidden = p.dataset.panel !== name
    if (name === 'qr') void startQr()
    else stopQr()
  }

  for (const t of tabs) t.addEventListener('click', () => selectTab(t.dataset.tab!))
  dialog.addEventListener('close', stopQr)

  async function submit(form: HTMLFormElement, status: HTMLElement, run: (data: FormData) => Promise<OpResult>, okMsg: string): Promise<void> {
    const btn = $<HTMLButtonElement>('button', form)
    btn.disabled = true
    show('Working…', status)
    try {
      const r = await run(new FormData(form))
      show(r.ok ? okMsg : r.message || 'Failed.', status, r.ok ? 'ok' : 'error')
      if (r.ok) form.reset()
    } catch (e) {
      show(String(e), status, 'error')
    } finally {
      btn.disabled = false
    }
  }

  const pairForm = $<HTMLFormElement>('#pair-form')
  pairForm.addEventListener('submit', (e) => {
    e.preventDefault()
    void submit(
      pairForm,
      $('#pair-status'),
      (d) => window.mobMirror.pair(String(d.get('hostPort')), String(d.get('code'))),
      'Paired. The phone should connect on its own. If it does not appear, use "Connect by address".',
    )
  })

  const connectForm = $<HTMLFormElement>('#connect-form')
  connectForm.addEventListener('submit', (e) => {
    e.preventDefault()
    void submit(connectForm, $('#connect-status'), (d) => window.mobMirror.connect(String(d.get('hostPort'))), 'Connected.')
  })

  $('#add-device').addEventListener('click', () => {
    dialog.showModal()
    selectTab('qr')
  })
}
