// Real-device smoke test. Opt in with: MOB_DEVICE=<adb serial> npm test
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CodecId } from '@shared/scrcpy/constants'
import { h264CodecString } from '@shared/scrcpy/h264'
import type { StreamEvent } from '@shared/scrcpy/stream'
import { Adb, findAdb } from '../../src/main/adb/adb'
import { ScrcpySession } from '../../src/main/scrcpy/session'

const serial = process.env.MOB_DEVICE

describe.skipIf(!serial)('scrcpy session on a real device', () => {
  it('handshakes and receives codec, session, config and a keyframe', async () => {
    const adb = new Adb(findAdb()!)
    const s = await ScrcpySession.start(adb, {
      serial: serial!,
      serverPath: join(__dirname, '../../resources/scrcpy-server-v5.0.1'),
      maxSize: 1024,
      videoBitRate: 4_000_000,
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

    console.log('device:', s.deviceName, events.slice(0, 3))
    expect(s.deviceName.length).toBeGreaterThan(0)
    expect(events[0]).toEqual({ type: 'codec', codecId: CodecId.H264 })
    expect(events[1]).toMatchObject({ type: 'session' })
    const cfg = events.find((e) => e.type === 'config')
    expect(cfg).toBeDefined()
    console.log('codec string:', h264CodecString((cfg as { data: Uint8Array }).data))
  }, 30000)
})
