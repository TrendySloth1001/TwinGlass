// Bridges a ScrcpySession to one renderer over a dedicated MessagePort.
// Electron's MessagePortMain can't transfer ArrayBuffers, so packets are structured-cloned.
// At a few Mbps of H.264 that copy is negligible.
import { clipboard, ipcMain, MessageChannelMain, type WebContents } from 'electron'
import type { Adb } from './adb/adb'
import { ScrcpySession } from './scrcpy/session'
import type { MainToRenderer, RendererToMain, StartSessionRequest } from '../shared/ipc'

const sessions = new Map<number, ScrcpySession>()

function stop(webContentsId: number): void {
  sessions.get(webContentsId)?.close()
  sessions.delete(webContentsId)
}

export function registerSessionIpc(getAdb: () => Adb | null, serverPath: () => string): void {
  ipcMain.handle('session:start', async (e, req: StartSessionRequest) => {
    const adb = getAdb()
    if (!adb) throw new Error('adb not found')
    const wc: WebContents = e.sender
    stop(wc.id)

    const session = await ScrcpySession.start(adb, {
      serial: req.serial,
      serverPath: serverPath(),
      maxSize: req.maxSize,
      videoBitRate: req.videoBitRate,
      maxFps: req.maxFps,
      stayAwake: true,
    })
    sessions.set(wc.id, session)

    const { port1, port2 } = new MessageChannelMain()
    const post = (m: MainToRenderer): void => port1.postMessage(m)

    session.on('video', (ev) => post({ t: 'video', ev }))
    session.on('deviceMessage', (msg) => {
      // The device clipboard changed (autosync, or after GET_CLIPBOARD): mirror it to the Mac.
      if (msg.type === 'clipboard') clipboard.writeText(msg.text)
      post({ t: 'device', msg })
    })
    session.on('log', (line) => post({ t: 'log', line }))
    session.once('closed', (err) => {
      post({ t: 'closed', error: err?.message })
      port1.close()
      if (sessions.get(wc.id) === session) sessions.delete(wc.id)
    })

    port1.on('message', ({ data }: { data: RendererToMain }) => {
      if (data.t === 'control') session.sendControl(data.data)
      else if (data.t === 'stop') session.close()
    })
    port1.start()
    session.begin()

    wc.once('destroyed', () => stop(wc.id))
    wc.postMessage('session:port', { deviceName: session.deviceName }, [port2])
    return { deviceName: session.deviceName }
  })

  ipcMain.handle('session:stop', (e) => stop(e.sender.id))
  ipcMain.handle('clipboard:read', () => clipboard.readText())
  ipcMain.handle('clipboard:write', (_e, text: string) => clipboard.writeText(text))
}

export function stopAllSessions(): void {
  for (const id of [...sessions.keys()]) stop(id)
}
