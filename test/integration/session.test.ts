// Real-device smoke test. Opt in with: MOB_DEVICE=<adb serial> npm test
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CodecId } from '@shared/scrcpy/constants'
import { h264CodecString } from '@shared/scrcpy/h264'
import { hevcCodecString } from '@shared/scrcpy/hevc'
import type { StreamEvent } from '@shared/scrcpy/stream'
import { resetVideo, startApp } from '@shared/scrcpy/control'
import { Adb, findAdb } from '../../src/main/adb/adb'
import { ScrcpySession } from '../../src/main/scrcpy/session'

const serial = process.env.MOB_DEVICE
const codec = process.env.MOB_CODEC === 'h265' ? 'h265' : 'h264'

describe.skipIf(!serial)('scrcpy session on a real device', () => {
  it('handshakes and receives codec, session, config and a keyframe', async () => {
    const adb = new Adb(findAdb()!)
    const s = await ScrcpySession.start(adb, {
      serial: serial!,
      serverPath: join(__dirname, '../../resources/scrcpy-server-v5.0.1'),
      maxSize: 1024,
      videoBitRate: 4_000_000,
      videoCodec: codec,
    })
    const events: StreamEvent[] = []
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`timeout; got ${events.map((e) => e.type)}`)), 10000)
      s.on('video', (e) => {
        events.push(e)
        if (e.type === 'packet' && e.keyFrame) {
          clearTimeout(t)
          resolve()
        }
      })
      s.begin()
    })
    s.close()

    console.log('device:', s.deviceName, events.slice(0, 2))
    expect(s.deviceName.length).toBeGreaterThan(0)
    expect(events[0]).toEqual({ type: 'codec', codecId: codec === 'h265' ? CodecId.H265 : CodecId.H264 })
    expect(events[1]).toMatchObject({ type: 'session' })
    const cfg = events.find((e) => e.type === 'config') as { data: Uint8Array } | undefined
    expect(cfg).toBeDefined()
    console.log('config hex:', Buffer.from(cfg!.data).toString('hex'))
    console.log('codec string:', codec === 'h265' ? hevcCodecString(cfg!.data) : h264CodecString(cfg!.data))
  }, 30000)

  it('RESET_VIDEO makes the phone send a new keyframe right away', async () => {
    const adb = new Adb(findAdb()!)
    const s = await ScrcpySession.start(adb, {
      serial: serial!,
      serverPath: join(__dirname, '../../resources/scrcpy-server-v5.0.1'),
      maxSize: 1024,
      videoBitRate: 4_000_000,
      videoCodec: codec,
    })
    let keys = 0
    let resetAt = 0
    const ms = await new Promise<number>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`no keyframe after reset (keys=${keys})`)), 8000)
      s.on('video', (e) => {
        if (e.type !== 'packet' || !e.keyFrame) return
        keys++
        if (keys === 1) {
          resetAt = Date.now()
          s.sendControl(resetVideo())
        } else {
          clearTimeout(t)
          resolve(Date.now() - resetAt)
        }
      })
      s.begin()
    })
    s.close()
    console.log(`keyframe ${ms} ms after RESET_VIDEO`)
    expect(ms).toBeLessThan(3000) // vs up to 10 s for the next scheduled keyframe
  }, 30000)

  it('second screen: an app runs on a new virtual display while the physical screen stays put', async () => {
    const adb = new Adb(findAdb()!)
    const resumed = async (): Promise<string> =>
      (await adb.runLoose(['shell', 'dumpsys window displays | grep -E "^  Display: mDisplayId=|mFocusedApp="'], serial!)).trim()
    const before = await resumed()
    const s = await ScrcpySession.start(adb, {
      serial: serial!,
      serverPath: join(__dirname, '../../resources/scrcpy-server-v5.0.1'),
      maxSize: 1024,
      videoBitRate: 4_000_000,
      videoCodec: codec,
      newDisplay: { width: 1080, height: 2400, dpi: 420 },
    })
    let size: { width: number; height: number } | null = null
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('no session packet from the virtual display')), 10000)
      s.on('video', (e) => {
        if (e.type === 'session') {
          size = { width: e.width, height: e.height }
          clearTimeout(t)
          resolve()
        }
      })
      s.begin()
    })
    s.sendControl(startApp('com.google.android.calculator'))
    await new Promise((r) => setTimeout(r, 3000))
    const during = await resumed()
    s.close()
    await new Promise((r) => setTimeout(r, 1500))
    const after = await resumed()
    console.log('video size', size, '\nBEFORE\n' + before + '\nDURING\n' + during + '\nAFTER\n' + after)
    expect(size).not.toBeNull()
    // Calculator resumed on a display other than 0 (the physical one).
    // `dumpsys window displays`: "  Display: mDisplayId=N" then that display's "mFocusedApp=…".
    const focus = (dump: string): Map<string, string> => {
      const m = new Map<string, string>()
      let id = ''
      for (const line of dump.split('\n')) {
        const d = /Display: mDisplayId=(\d+)/.exec(line)
        if (d) id = d[1]!
        const f = /mFocusedApp=.*?\s(\S+\/\S+)/.exec(line)
        if (f && id && !m.has(id)) m.set(id, f[1]!)
      }
      return m
    }
    const b0 = focus(before).get('0')
    const d = focus(during)
    expect([...d.entries()].some(([id, app]) => id !== '0' && /calculator/.test(app))).toBe(true)
    expect(d.get('0')).toBe(b0) // the physical screen kept its app
  }, 40000)
})
