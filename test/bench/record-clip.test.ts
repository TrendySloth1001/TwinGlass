// Records a short real H.264 stream (Settings scrolling on a virtual display) for the direct-link
// replay test. Opt in: MOB_DEVICE=<serial> MOB_RECORD=<out.json> npx vitest run test/bench/record-clip
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'vitest'
import { startApp } from '@shared/scrcpy/control'
import { Adb, findAdb } from '../../src/main/adb/adb'
import { ScrcpySession } from '../../src/main/scrcpy/session'

describe.skipIf(!process.env.MOB_DEVICE || !process.env.MOB_RECORD)('record a clip', () => {
  it('records 4 s', async () => {
    const adb = new Adb(findAdb()!)
    const s = await ScrcpySession.start(adb, {
      serial: process.env.MOB_DEVICE!,
      serverPath: join(__dirname, '../../resources/scrcpy-server-v5.0.1'),
      newDisplay: { width: 1080, height: 2400, dpi: 420 },
      videoCodec: 'h264',
      maxSize: 1600,
      videoBitRate: 4_000_000,
    })
    const evs: unknown[] = []
    s.on('video', (e) => {
      if (e.type === 'codec') evs.push({ type: 'codec', codecId: e.codecId })
      else if (e.type === 'session') evs.push(e)
      else if (e.type === 'config') evs.push({ type: 'config', data: Buffer.from(e.data).toString('base64') })
      else evs.push({ type: 'packet', pts: e.pts.toString(), keyFrame: e.keyFrame, data: Buffer.from(e.data).toString('base64') })
    })
    s.begin()
    await new Promise((r) => setTimeout(r, 1200))
    s.sendControl(startApp('com.android.settings'))
    await new Promise((r) => setTimeout(r, 1500))
    const d = s.displayId
    void adb.runLoose(['shell', `for i in 1 2 3; do input -d ${d} swipe 540 1900 540 500 300; input -d ${d} swipe 540 500 540 1900 300; done`], process.env.MOB_DEVICE!)
    await new Promise((r) => setTimeout(r, 4000))
    s.close()
    writeFileSync(process.env.MOB_RECORD!, JSON.stringify(evs))
    console.log('recorded', evs.length, 'events')
  }, 60_000)
})
