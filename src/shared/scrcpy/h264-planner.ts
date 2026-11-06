// Turns scrcpy video stream events into WebCodecs actions. Pure logic, unit-tested; the
// renderer's VideoView executes the actions. Rules from docs/FACTS.md (WebCodecs section).
import { CodecId } from './constants'
import { h264CodecString } from './h264'
import { hevcCodecString } from './hevc'
import type { StreamEvent } from './stream'

export type DecoderAction =
  | { kind: 'size'; width: number; height: number }
  | { kind: 'configure'; codec: string }
  | { kind: 'decode'; type: 'key' | 'delta'; timestamp: number; data: Uint8Array }

/** Plans WebCodecs actions for an H.264 or H.265 (Annex-B) scrcpy stream. */
export class H264Planner {
  /** Codec of the current stream, from the codec id that starts it. */
  private kind: 'h264' | 'h265' = 'h264'
  private config: Uint8Array | null = null
  private codec: string | null = null
  private needKey = true

  get codecString(): string | null {
    return this.codec
  }

  /** Call after a decoder error/reset: drop deltas until the next keyframe. */
  requestKeyFrame(): void {
    this.needKey = true
  }

  /** @param queueSize the decoder's current decodeQueueSize */
  handle(ev: StreamEvent, queueSize = 0): DecoderAction[] {
    switch (ev.type) {
      case 'codec':
        if (ev.codecId === CodecId.H264) this.kind = 'h264'
        else if (ev.codecId === CodecId.H265) this.kind = 'h265'
        else throw new Error(`unsupported video codec 0x${ev.codecId.toString(16)}`)
        return []
      case 'session':
        this.needKey = true
        return [{ kind: 'size', width: ev.width, height: ev.height }]
      case 'config':
        this.config = ev.data
        this.codec = this.kind === 'h265' ? hevcCodecString(ev.data) : h264CodecString(ev.data)
        this.needKey = true
        return [{ kind: 'configure', codec: this.codec }]
      case 'packet': {
        if (!this.codec || !this.config) return []
        const timestamp = Number(ev.pts)
        if (!ev.keyFrame) {
          if (this.needKey) return []
          return [{ kind: 'decode', type: 'delta', timestamp, data: ev.data }]
        }
        this.needKey = false
        // Annex-B without `description`: every key chunk must carry SPS/PPS inline.
        const data = new Uint8Array(this.config.length + ev.data.length)
        data.set(this.config)
        data.set(ev.data, this.config.length)
        const actions: DecoderAction[] = []
        // Latency cap: if frames are backing up, drop them and restart from this keyframe.
        if (queueSize > 0) actions.push({ kind: 'configure', codec: this.codec })
        actions.push({ kind: 'decode', type: 'key', timestamp, data })
        return actions
      }
    }
  }
}
