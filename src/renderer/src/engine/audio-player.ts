// Opus (scrcpy audio stream) -> WebCodecs AudioDecoder -> Web Audio, with a small jitter buffer.
import { CodecId } from '@shared/scrcpy/constants'
import type { StreamEvent } from '@shared/scrcpy/stream'

/** Target playout delay. Lower = less lag, higher = fewer glitches on Wi-Fi. */
const TARGET_LATENCY = 0.06
/** If the schedule drifts beyond this, resync (e.g. after a Wi-Fi stall). */
const MAX_LATENCY = 0.3

export class AudioPlayer {
  readonly ctx = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' })
  private readonly gain = this.ctx.createGain()
  /** Tap for recordings (MediaRecorder needs a MediaStream). */
  readonly stream: MediaStream
  private decoder: AudioDecoder | null = null
  private nextTime = 0
  state: 'waiting' | 'playing' | 'unavailable' = 'waiting'

  constructor(private readonly onError: (e: Error) => void) {
    const dest = this.ctx.createMediaStreamDestination()
    this.gain.connect(this.ctx.destination)
    this.gain.connect(dest)
    this.stream = dest.stream
  }

  set muted(m: boolean) {
    this.gain.gain.value = m ? 0 : 1
  }

  handle(ev: StreamEvent): void {
    if (ev.type === 'codec') {
      if (ev.codecId === CodecId.DISABLED || ev.codecId === CodecId.ERROR) this.state = 'unavailable'
      else if (ev.codecId !== CodecId.OPUS) {
        this.state = 'unavailable'
        this.onError(new Error(`unsupported audio codec 0x${ev.codecId.toString(16)}`))
      }
      return
    }
    if (ev.type === 'config') {
      // scrcpy strips Android's AOPUSHDR wrapper: this is a bare OpusHead, i.e. the description.
      this.decoder?.close()
      this.decoder = new AudioDecoder({
        output: (data) => this.play(data),
        error: (e) => this.onError(e instanceof Error ? e : new Error(String(e))),
      })
      this.decoder.configure({ codec: 'opus', sampleRate: 48000, numberOfChannels: 2, description: ev.data })
      this.state = 'playing'
      return
    }
    if (ev.type === 'packet' && this.decoder?.state === 'configured') {
      this.decoder.decode(new EncodedAudioChunk({ type: 'key', timestamp: Number(ev.pts), data: ev.data }))
    }
  }

  private play(data: AudioData): void {
    const channels = data.numberOfChannels
    const buffer = this.ctx.createBuffer(channels, data.numberOfFrames, data.sampleRate)
    for (let c = 0; c < channels; c++) {
      data.copyTo(buffer.getChannelData(c), { planeIndex: c, format: 'f32-planar' })
    }
    data.close()
    const now = this.ctx.currentTime
    if (this.nextTime < now || this.nextTime > now + MAX_LATENCY) this.nextTime = now + TARGET_LATENCY
    const src = this.ctx.createBufferSource()
    src.buffer = buffer
    src.connect(this.gain)
    src.start(this.nextTime)
    this.nextTime += buffer.duration
  }

  dispose(): void {
    if (this.decoder && this.decoder.state !== 'closed') this.decoder.close()
    void this.ctx.close()
  }
}
