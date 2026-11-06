// WebCodecs H.264 decoding to a canvas.
import { H264Planner, type DecoderAction } from '@shared/scrcpy/h264-planner'
import type { StreamEvent } from '@shared/scrcpy/stream'

export interface VideoStats {
  width: number
  height: number
  fps: number
  codec: string | null
  hardware: string
}

export class VideoView {
  private planner = new H264Planner()
  private decoder: VideoDecoder
  private ctx: CanvasRenderingContext2D
  private frames = 0
  private fps = 0
  private fpsTimer: number
  private hardware = 'unknown'
  /** Video size from the latest session packet; touch coordinates must use exactly this. */
  size: { width: number; height: number } | null = null

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onError: (e: Error) => void,
    private readonly onSize: (w: number, h: number) => void,
  ) {
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
    frame.close()
    this.frames++
  }

  private configure(codec: string): void {
    if (this.decoder.state === 'configured') this.decoder.reset()
    if (this.decoder.state === 'closed') this.decoder = this.createDecoder()
    this.decoder.configure({ codec, optimizeForLatency: true, hardwareAcceleration: 'no-preference' })
    void VideoDecoder.isConfigSupported({ codec, hardwareAcceleration: 'prefer-hardware' }).then(
      (r) => (this.hardware = r.supported ? 'hardware' : 'software'),
      () => (this.hardware = 'software'),
    )
  }

  handle(ev: StreamEvent): void {
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
        this.decoder.decode(new EncodedVideoChunk({ type: a.type, timestamp: a.timestamp, data: a.data }))
      }
    }
  }

  stats(): VideoStats {
    return {
      width: this.size?.width ?? 0,
      height: this.size?.height ?? 0,
      fps: this.fps,
      codec: this.planner.codecString,
      hardware: this.hardware,
    }
  }

  dispose(): void {
    clearInterval(this.fpsTimer)
    if (this.decoder.state !== 'closed') this.decoder.close()
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
  }
}
