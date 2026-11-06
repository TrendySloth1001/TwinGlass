// WebCodecs H.264 decoding to a canvas, with per-stage latency accounting.
import { H264Planner, type DecoderAction } from '@shared/scrcpy/h264-planner'
import type { StreamEvent } from '@shared/scrcpy/stream'

export interface LatencyStats {
  /** main process received the packet -> renderer got it (MessagePort hop). */
  ipcMs: number
  /** decoder.decode() -> frame output. */
  decodeMs: number
  /** main received -> frame drawn on the canvas (everything on the Mac side). */
  appMs: number
  /**
   * Network + encoder jitter: how much later than the fastest recent packet this one arrived,
   * relative to its capture timestamp. Absolute phone->Mac delay can't be measured (different
   * clocks), but this shows Wi-Fi queueing/stalls.
   */
  jitterMs: number
  /** Frames waiting in the decoder (should stay ~0). */
  queue: number
}

export interface VideoStats {
  width: number
  height: number
  fps: number
  codec: string | null
  hardware: string
  latency: LatencyStats
}

/** Epoch-based ms clock shared by main and renderer (same machine). */
export const wallNow = (): number => performance.timeOrigin + performance.now()

/** Exponentially weighted moving average. */
const ewma = (prev: number, sample: number, alpha = 0.1): number => (prev === 0 ? sample : prev + alpha * (sample - prev))

/** Sliding minimum over the last `n` samples. */
class WindowMin {
  private values: number[] = []
  constructor(private readonly n: number) {}
  push(v: number): number {
    this.values.push(v)
    if (this.values.length > this.n) this.values.shift()
    return Math.min(...this.values)
  }
}

export class VideoView {
  private planner = new H264Planner()
  private decoder: VideoDecoder
  private ctx: CanvasRenderingContext2D
  private frames = 0
  private fps = 0
  private fpsTimer: number
  private hardware = 'unknown'
  /** chunk timestamp -> [main receive time, decode() time] */
  private inflight = new Map<number, [number, number]>()
  private transitMin = new WindowMin(300)
  private lat: LatencyStats = { ipcMs: 0, decodeMs: 0, appMs: 0, jitterMs: 0, queue: 0 }
  /** Video size from the latest session packet; touch coordinates must use exactly this. */
  size: { width: number; height: number } | null = null

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onError: (e: Error) => void,
    private readonly onSize: (w: number, h: number) => void,
  ) {
    // desynchronized: low-latency canvas that can bypass the compositor's extra frame of delay.
    this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true })!
    this.decoder = this.createDecoder()
    this.fpsTimer = window.setInterval(() => {
      this.fps = this.frames
      this.frames = 0
    }, 1000)
  }

  private createDecoder(): VideoDecoder {
    return new VideoDecoder({
      output: (frame) => this.draw(frame),
      error: (e) => {
        // Recover: build a fresh decoder and wait for the next keyframe.
        this.onError(e instanceof Error ? e : new Error(String(e)))
        this.inflight.clear()
        this.decoder = this.createDecoder()
        this.planner.requestKeyFrame()
        const codec = this.planner.codecString
        if (codec) this.configure(codec)
      },
    })
  }

  private draw(frame: VideoFrame): void {
    const w = frame.displayWidth
    const h = frame.displayHeight
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w
      this.canvas.height = h
    }
    this.ctx.drawImage(frame, 0, 0, w, h)
    const t = this.inflight.get(frame.timestamp)
    if (t) {
      this.inflight.delete(frame.timestamp)
      const now = wallNow()
      this.lat.decodeMs = ewma(this.lat.decodeMs, now - t[1])
      this.lat.appMs = ewma(this.lat.appMs, now - t[0])
    }
    frame.close()
    this.frames++
  }

  private configure(codec: string): void {
    this.inflight.clear()
    if (this.decoder.state === 'configured') this.decoder.reset()
    if (this.decoder.state === 'closed') this.decoder = this.createDecoder()
    this.decoder.configure({ codec, optimizeForLatency: true, hardwareAcceleration: 'no-preference' })
    void VideoDecoder.isConfigSupported({ codec, hardwareAcceleration: 'prefer-hardware' }).then(
      (r) => (this.hardware = r.supported ? 'hardware' : 'software'),
      () => (this.hardware = 'software'),
    )
  }

  /** @param receivedAt wallNow() in the main process when the packet arrived from the phone */
  handle(ev: StreamEvent, receivedAt?: number): void {
    const now = wallNow()
    if (receivedAt !== undefined && ev.type === 'packet') {
      this.lat.ipcMs = ewma(this.lat.ipcMs, now - receivedAt)
      const transit = receivedAt - Number(ev.pts) / 1000
      this.lat.jitterMs = ewma(this.lat.jitterMs, transit - this.transitMin.push(transit), 0.2)
    }
    let actions: DecoderAction[]
    try {
      actions = this.planner.handle(ev, this.decoder.decodeQueueSize)
    } catch (e) {
      this.onError(e as Error)
      return
    }
    for (const a of actions) {
      if (a.kind === 'size') {
        this.size = { width: a.width, height: a.height }
        this.onSize(a.width, a.height)
      } else if (a.kind === 'configure') {
        this.configure(a.codec)
      } else if (this.decoder.state === 'configured') {
        this.inflight.set(a.timestamp, [receivedAt ?? now, wallNow()])
        if (this.inflight.size > 120) this.inflight.delete(this.inflight.keys().next().value!) // dropped frames
        this.decoder.decode(new EncodedVideoChunk({ type: a.type, timestamp: a.timestamp, data: a.data }))
      }
    }
    this.lat.queue = this.decoder.decodeQueueSize
  }

  stats(): VideoStats {
    return {
      width: this.size?.width ?? 0,
      height: this.size?.height ?? 0,
      fps: this.fps,
      codec: this.planner.codecString,
      hardware: this.hardware,
      latency: { ...this.lat },
    }
  }

  dispose(): void {
    clearInterval(this.fpsTimer)
    if (this.decoder.state !== 'closed') this.decoder.close()
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
  }
}
