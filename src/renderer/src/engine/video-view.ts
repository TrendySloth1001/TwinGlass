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
  /** Settings → Advanced → Decoder (WebCodecs hardwareAcceleration). Set before the first config. */
  accel: HardwareAcceleration = 'no-preference'

  /** Video size from the latest session packet; touch coordinates must use exactly this. */
  size: { width: number; height: number } | null = null

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onError: (e: Error) => void,
    private readonly onSize: (w: number, h: number) => void,
    /** Sends RESET_VIDEO to the phone (new keyframe now). */
    private readonly onRequestKeyFrame: () => void = () => {},
  ) {
    // desynchronized: low-latency canvas that can bypass the compositor's extra frame of delay.
    this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true })!
    this.decoder = this.createDecoder()
    this.fpsTimer = window.setInterval(() => {
      this.fps = this.frames
      this.frames = 0
    }, 1000)
    document.addEventListener('visibilitychange', this.onVisibility)
  }

  // ---- frame pacing ----
  // The phone can send more frames than the screen shows (the A024 runs at 120 Hz), and with
  // several windows that is wasted drawing. Keep only the newest decoded frame and draw it on the
  // next screen refresh; while the window is hidden, don't draw at all (the newest frame is kept
  // and drawn when it shows again, or on flush() for agent screenshots).

  private pending: VideoFrame | null = null
  private raf = 0
  /** Something needs every frame drawn even while hidden (a recording reads the canvas). */
  keepDrawing = false

  private enqueue(frame: VideoFrame): void {
    this.frames++ // fps = decoded frames, as before
    this.pending?.close() // superseded before it could be shown
    this.pending = frame
    if (this.keepDrawing) return this.flush()
    if (this.raf || document.visibilityState === 'hidden') return
    // Measured (Wi-Fi, 120 Hz phone, 2026-11-08, test probe on a second screen): packet → drawn is
    // ~12 ms either way (drawing each frame at once vs on the next refresh; runs vary ±4 ms), so
    // pace to requestAnimationFrame: same latency, fewer wasted draws.
    this.raf = requestAnimationFrame(() => {
      this.raf = 0
      this.flush()
    })
  }

  /** Draws the newest decoded frame now (if one is waiting). */
  flush(): void {
    const f = this.pending
    if (!f) return
    this.pending = null
    this.draw(f)
  }

  private onVisibility = (): void => {
    if (document.visibilityState === 'visible') this.flush()
  }

  private createDecoder(): VideoDecoder {
    return new VideoDecoder({
      output: (frame) => this.enqueue(frame),
      error: (e) => {
        // Recover: build a fresh decoder and wait for the next keyframe.
        this.onError(e instanceof Error ? e : new Error(String(e)))
        this.inflight.clear()
        this.decoder = this.createDecoder()
        this.planner.requestKeyFrame()
        this.requestKeyFrame() // don't wait up to 10 s for the phone's next scheduled keyframe
        const codec = this.planner.codecString
        if (codec) this.configure(codec)
      },
    })
  }

  private lastKeyRequest = 0
  /** Rate-limited (1/s): each RESET_VIDEO restarts the phone's encoder. */
  private requestKeyFrame(): void {
    const now = performance.now()
    if (now - this.lastKeyRequest < 1000) return
    this.lastKeyRequest = now
    this.keyRequests++
    this.onRequestKeyFrame()
  }
  /** Keyframes requested so far (diagnostics). */
  keyRequests = 0

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
  }

  private configure(codec: string): void {
    this.inflight.clear()
    if (this.decoder.state === 'configured') this.decoder.reset()
    if (this.decoder.state === 'closed') this.decoder = this.createDecoder()
    this.decoder.configure({ codec, optimizeForLatency: true, hardwareAcceleration: this.accel })
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
      } else if (a.kind === 'requestKeyFrame') {
        this.requestKeyFrame()
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
    document.removeEventListener('visibilitychange', this.onVisibility)
    cancelAnimationFrame(this.raf)
    this.pending?.close()
    this.pending = null
    if (this.decoder.state !== 'closed') this.decoder.close()
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
  }
}
