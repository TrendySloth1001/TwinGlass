// Mac screen -> hardware H.264 (WebCodecs, realtime) -> main process -> phone (see main/mac-screen.ts).
export interface MacScreenStats {
  width: number
  height: number
  fps: number
  /** Frame read from capture -> encoded chunk out (ms, moving average). */
  encodeMs: number
}

const KEY_INTERVAL_MS = 2000

/** Chromium's MediaStreamTrackProcessor (not in TypeScript's DOM lib yet): a track as a stream of frames. */
declare const MediaStreamTrackProcessor: new (init: { track: MediaStreamTrack }) => { readable: ReadableStream<VideoFrame> }

export class MacScreenSender {
  private stream: MediaStream | null = null
  private encoder: VideoEncoder | null = null
  private reader: ReadableStreamDefaultReader<VideoFrame> | null = null
  private wantKey = true
  private lastKey = 0
  private frames = 0
  private fps = 0
  private timer = 0
  private configured = ''
  private encodeMs = 0
  /** Wall-clock µs (epoch) of the frame being encoded: sent as the chunk timestamp, so the phone can
   * measure capture -> on-screen after a clock sync. */
  private wallUs = (): number => Math.round((performance.timeOrigin + performance.now()) * 1000)
  stopped = false

  constructor(
    private readonly send: {
      config: (json: string) => void
      chunk: (type: 1 | 2, timestampUs: number, data: Uint8Array) => void
    },
    private readonly onEnded: (reason?: string) => void,
  ) {}

  /** Next frame is a key frame (a viewer joined, or one fell behind). */
  requestKeyFrame(): void {
    this.wantKey = true
  }

  stats(): MacScreenStats {
    const s = this.stream?.getVideoTracks()[0]?.getSettings()
    return { width: s?.width ?? 0, height: s?.height ?? 0, fps: this.fps, encodeMs: Math.round(this.encodeMs * 10) / 10 }
  }

  /** @param max largest size to send (extend mode sends the phone's full resolution) */
  async start(max = { width: 1920, height: 1200 }): Promise<void> {
    // Main's display-media handler picks the main screen; no picker. Cap at 1920 wide: phone
    // screens are ~2400 px on the long side, and this keeps encode + Wi-Fi light.
    this.stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
    const track = this.stream.getVideoTracks()[0]
    if (!track) throw new Error('No screen video track')
    // Scale after capture (more compatible than capture-time constraints).
    await track.applyConstraints({ width: { max: max.width }, height: { max: max.height }, frameRate: { max: 60 } }).catch(() => {})
    track.addEventListener('ended', () => this.stop('The screen capture ended.'))
    this.timer = window.setInterval(() => {
      this.fps = this.frames
      this.frames = 0
    }, 1000)

    const encoder = new VideoEncoder({
      output: (chunk, meta) => {
        const codec = meta?.decoderConfig?.codec
        if (codec) {
          const key = `${codec}:${meta.decoderConfig?.codedWidth}x${meta.decoderConfig?.codedHeight}`
          if (key !== this.configured) {
            this.configured = key
            this.send.config(JSON.stringify({ codec, width: meta.decoderConfig?.codedWidth, height: meta.decoderConfig?.codedHeight }))
          }
        }
        const data = new Uint8Array(chunk.byteLength)
        chunk.copyTo(data)
        const ms = (this.wallUs() - chunk.timestamp) / 1000
        this.encodeMs = this.encodeMs ? this.encodeMs + 0.1 * (ms - this.encodeMs) : ms
        this.send.chunk(chunk.type === 'key' ? 1 : 2, chunk.timestamp, data)
      },
      error: (e) => this.stop(`Encoder error: ${e.message}`),
    })
    this.encoder = encoder

    const processor = new MediaStreamTrackProcessor({ track })
    this.reader = processor.readable.getReader()
    let size = ''
    for (;;) {
      const { value: frame, done } = await this.reader.read().catch(() => ({ value: undefined, done: true }))
      if (done || !frame || this.stopped) {
        frame?.close()
        break
      }
      const w = frame.displayWidth & ~1 // H.264 needs even dimensions
      const h = frame.displayHeight & ~1
      if (`${w}x${h}` !== size) {
        size = `${w}x${h}`
        encoder.configure({
          codec: 'avc1.640033', // High profile, level 5.1: up to 4096x2304 (2800x1260 phone fits) @ 60
          width: w,
          height: h,
          bitrate: 10_000_000,
          framerate: 60,
          latencyMode: 'realtime',
          hardwareAcceleration: 'prefer-hardware',
          avc: { format: 'annexb' }, // SPS/PPS inline: a viewer can start at any key frame
        })
        this.wantKey = true
      }
      // Don't queue: if the encoder is behind, skip this frame (lowest latency).
      if (encoder.state !== 'configured' || encoder.encodeQueueSize > 2) {
        frame.close()
        continue
      }
      const now = performance.now()
      const key = this.wantKey || now - this.lastKey > KEY_INTERVAL_MS
      if (key) {
        this.wantKey = false
        this.lastKey = now
      }
      // Re-stamp with the wall clock at capture read (VideoFrame timestamps are on another clock).
      const stamped = new VideoFrame(frame, { timestamp: this.wallUs() })
      frame.close()
      encoder.encode(stamped, { keyFrame: key })
      stamped.close()
      this.frames++
    }
  }

  stop(reason?: string): void {
    if (this.stopped) return
    this.stopped = true
    clearInterval(this.timer)
    void this.reader?.cancel().catch(() => {})
    for (const t of this.stream?.getTracks() ?? []) t.stop()
    if (this.encoder && this.encoder.state !== 'closed') this.encoder.close()
    this.onEnded(reason)
  }
}
