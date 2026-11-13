// Design QA: compares a Figma frame with the phone's screen. Talks to Figma's REST API only when the
// user (or an agent) runs a comparison, with the user's personal access token, kept encrypted by the
// macOS keychain (safeStorage) in userData. The comparison itself is pure (agent/design-qa.ts).
import { app, ipcMain, safeStorage } from 'electron'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { DeviceController } from './agent/controller'
import { compareDesign, figmaFrame, parseFigmaUrl, type DesignReport } from './agent/design-qa'

const tokenFile = (): string => join(app.getPath('userData'), 'figma-token.bin')

async function readToken(): Promise<string | null> {
  try {
    const buf = await readFile(tokenFile())
    return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : null
  } catch {
    return null
  }
}

async function figma<T>(path: string, token: string): Promise<T> {
  const r = await fetch(`https://api.figma.com${path}`, { headers: { 'X-Figma-Token': token } })
  if (r.status === 403 || r.status === 401) throw new Error('Figma refused the token. Add a new one in the Design check view.')
  if (r.status === 404) throw new Error('Figma can’t find that file or frame (or the token can’t see it).')
  if (!r.ok) throw new Error(`Figma answered ${r.status}.`)
  return (await r.json()) as T
}

export interface DesignCompareResult {
  report: DesignReport
  /** The frame as Figma renders it, and the phone's screen (data URLs), for a side-by-side look. */
  designImage?: string
  screenImage?: string
}

export async function compareWithFigma(ctl: DeviceController, url: string, device: string | undefined, withImages = true): Promise<DesignCompareResult> {
  const ref = parseFigmaUrl(url)
  if (!ref) throw new Error('That isn’t a Figma frame link. In Figma, right-click the frame → Copy link to selection.')
  const token = await readToken()
  if (!token) throw new Error('Add a Figma access token first (Design check view, or Settings → Figma).')
  const nodes = await figma<{ nodes: Record<string, { document?: Parameters<typeof figmaFrame>[0] } | null> }>(
    `/v1/files/${encodeURIComponent(ref.fileKey)}/nodes?ids=${encodeURIComponent(ref.nodeId)}`,
    token,
  )
  const doc = nodes.nodes[ref.nodeId]?.document
  const frame = doc ? figmaFrame(doc) : null
  if (!frame) throw new Error('That link doesn’t point at a frame with a size.')
  const { map } = await ctl.screenMap({ detail: 'full', image: false, colors: true }, device, 'phone')
  const report = compareDesign(frame, map)
  if (!withImages) return { report }
  const [designImage, screenImage] = await Promise.all([
    figma<{ images: Record<string, string | null> }>(`/v1/images/${encodeURIComponent(ref.fileKey)}?ids=${encodeURIComponent(ref.nodeId)}&format=png&scale=1`, token)
      .then(async (r) => {
        const u = r.images[ref.nodeId]
        if (!u) return undefined
        const img = await fetch(u)
        return img.ok ? `data:image/png;base64,${Buffer.from(await img.arrayBuffer()).toString('base64')}` : undefined
      })
      .catch(() => undefined),
    ctl
      .screenshot(device, 'phone')
      .then((s) => `data:${s.mimeType};base64,${s.data}`)
      .catch(() => undefined),
  ])
  return { report, designImage, screenImage }
}

export function registerDesignIpc(ctl: DeviceController): void {
  ipcMain.handle('design:token-status', async () => ({ saved: (await readToken()) !== null }))
  ipcMain.handle('design:set-token', async (_e, token: unknown) => {
    if (typeof token !== 'string' || token.trim().length < 20) throw new Error('That doesn’t look like a Figma access token.')
    if (!safeStorage.isEncryptionAvailable()) throw new Error('The macOS keychain isn’t available, so the token can’t be stored safely.')
    // Check it works before keeping it.
    const me = await figma<{ handle?: string; email?: string }>('/v1/me', token.trim())
    await writeFile(tokenFile(), safeStorage.encryptString(token.trim()), { mode: 0o600 })
    return { saved: true, handle: me.handle ?? null }
  })
  ipcMain.handle('design:clear-token', async () => {
    await rm(tokenFile(), { force: true })
    return { saved: false }
  })
  ipcMain.handle('design:compare', (_e, url: unknown, device: unknown) => {
    if (typeof url !== 'string') throw new Error('Paste a Figma frame link.')
    return compareWithFigma(ctl, url, typeof device === 'string' ? device : undefined)
  })
}
