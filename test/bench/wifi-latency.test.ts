// Wi-Fi streaming benchmark (opt in: MOB_DEVICE=<serial> MOB_BENCH=1 npx vitest run test/bench).
// Streams a scrolling Settings app on a virtual display (the user's screen is untouched) and
// measures how much delay the link + encoder queue add per frame: arrival time (Mac) minus the
// frame's PTS (phone), relative to the best frame. That variation is what makes Wi-Fi feel laggy.
import { join } from 'node:path'
import { describe, it } from 'vitest'
import { startApp } from '@shared/scrcpy/control'
import { Adb, findAdb } from '../../src/main/adb/adb'
import { ScrcpySession, type SessionOptions } from '../../src/main/scrcpy/session'

const serial = process.env.MOB_DEVICE
const RUN_MS = 14_000

const pct = (xs: number[], p: number): number => xs[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))]!

async function measure(adb: Adb, label: string, o: Partial<SessionOptions>): Promise<string> {
  const s = await ScrcpySession.start(adb, {
    serial: serial!,
    serverPath: join(__dirname, '../../resources/scrcpy-server-v5.0.1'),
    newDisplay: { width: 1080, height: 2400, dpi: 420 },
    videoCodec: 'h265',
    maxSize: 1600,
    videoBitRate: 6_000_000,
    ...o,
  })
  const rows: { at: number; pts: number; size: number; key: boolean }[] = []
  let error = ''
  s.on('log', (l) => {
    if (/ERROR|Exception/.test(l)) error ||= l.trim().split('\n')[0]!
  })
  s.on('video', (e) => {
    if (e.type === 'packet') rows.push({ at: performance.now(), pts: Number(e.pts) / 1000, size: e.data.length, key: e.keyFrame })
  })
  s.begin()
  await new Promise((r) => setTimeout(r, 1200))
  s.sendControl(startApp('com.android.settings'))
  await new Promise((r) => setTimeout(r, 1500))
  const d = s.displayId
  // Steady motion: scroll up and down for the whole run, plus one keyframe-heavy app switch.
  const loop = `for i in $(seq 1 40); do input -d ${d} swipe 600 2200 600 600 250; input -d ${d} swipe 600 600 600 2200 250; done`
  const motion = adb.runLoose(['shell', loop], serial!, RUN_MS + 20_000)
  const t0 = performance.now()
  rows.length = 0
  await new Promise((r) => setTimeout(r, RUN_MS))
  const got = rows.slice()
  s.close()
  await motion.catch(() => {})
  if (got.length < 20) return `${label}: too few frames (${got.length}) ${error}`
  const delay = got.map((r) => r.at - r.pts)
  const min = Math.min(...delay)
  const q = delay.map((x) => x - min).sort((a, b) => a - b)
  const secs = (performance.now() - t0) / 1000
  const bytes = got.reduce((a, r) => a + r.size, 0)
  const keys = got.filter((r) => r.key)
  const big = Math.max(...got.map((r) => r.size))
  return [
    label.padEnd(34),
    `fps ${(got.length / secs).toFixed(0).padStart(3)}`,
    `${((bytes * 8) / secs / 1e6).toFixed(1).padStart(4)} Mbps`,
    `added delay p50 ${pct(q, 50).toFixed(0).padStart(3)} p95 ${pct(q, 95).toFixed(0).padStart(3)} p99 ${pct(q, 99).toFixed(0).padStart(3)} max ${q[q.length - 1]!.toFixed(0).padStart(4)} ms`,
    `keyframes ${keys.length}, largest frame ${(big / 1024).toFixed(0)} KB`,
    error && `!! ${error}`,
  ]
    .filter(Boolean)
    .join(' | ')
}

describe.skipIf(!serial || !process.env.MOB_BENCH)('Wi-Fi latency benchmark', () => {
  it('compares stream settings', async () => {
    const adb = new Adb(findAdb()!)
    // MOB_BENCH_SET=usb: USB presets on a phone-sized (1260×2800) display; default: the Wi-Fi set.
    const usb: [string, Partial<SessionOptions>][] = [
      ['U1 native 16 Mbps h265 (High)', { maxSize: 0, videoBitRate: 16_000_000, newDisplay: { width: 1260, height: 2800, dpi: 480 } }],
      ['U2 1920 12 Mbps h265', { maxSize: 1920, videoBitRate: 12_000_000, newDisplay: { width: 1260, height: 2800, dpi: 480 } }],
      ['U3 1600 8 Mbps h265', { maxSize: 1600, videoBitRate: 8_000_000, newDisplay: { width: 1260, height: 2800, dpi: 480 } }],
      ['U4 1600 8 Mbps h264', { maxSize: 1600, videoBitRate: 8_000_000, videoCodec: 'h264', newDisplay: { width: 1260, height: 2800, dpi: 480 } }],
      ['U5 native 16 Mbps h264', { maxSize: 0, videoBitRate: 16_000_000, videoCodec: 'h264', newDisplay: { width: 1260, height: 2800, dpi: 480 } }],
    ]
    if (process.env.MOB_BENCH_SET === 'usb') {
      for (const [label, o] of usb) console.log(await measure(adb, label, o))
      return
    }
    const configs: [string, Partial<SessionOptions>][] = [
      ['A now: h265 1600 6 Mbps', {}],
      ['B h264 1600 6 Mbps', { videoCodec: 'h264' }],
      ['C h265 1600 4 Mbps', { videoBitRate: 4_000_000 }],
      ['D h265 1280 4 Mbps', { maxSize: 1280, videoBitRate: 4_000_000 }],
      ['E h265 1600 6 Mbps intra-refresh', { videoCodecOptions: { 'intra-refresh-period': 60 } }],
      ['F h265 1600 6 Mbps max 60 fps', { maxFps: 60 }],
    ]
    for (const [label, o] of configs) console.log(await measure(adb, label, o))
  }, 300_000)
})
