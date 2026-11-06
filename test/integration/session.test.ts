// Real-device smoke test. Opt in with: MOB_DEVICE=<adb serial> npm test
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CodecId } from '@shared/scrcpy/constants'
import { h264CodecString } from '@shared/scrcpy/h264'
import { hevcCodecString } from '@shared/scrcpy/hevc'
import type { StreamEvent } from '@shared/scrcpy/stream'
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
})
