// Records the mirror canvas (+ forwarded audio) with MediaRecorder, streaming chunks to disk via main.

const RECORD_FPS = 30

const CANDIDATES: { mime: string; ext: 'mp4' | 'webm' }[] = [
  { mime: 'video/mp4;codecs=avc1.640028,opus', ext: 'mp4' },
  { mime: 'video/mp4;codecs=avc1,mp4a.40.2', ext: 'mp4' },
  { mime: 'video/mp4', ext: 'mp4' },
  { mime: 'video/webm;codecs=vp9,opus', ext: 'webm' },
  { mime: 'video/webm', ext: 'webm' },
]

export function pickFormat(): { mime: string; ext: 'mp4' | 'webm' } {
  return CANDIDATES.find((c) => MediaRecorder.isTypeSupported(c.mime)) ?? CANDIDATES[CANDIDATES.length - 1]!
}

export class Recorder {
  private recorder: MediaRecorder | null = null
  private id = 0
  private writes: Promise<void> = Promise.resolve()
  private frameTimer = 0
  startedAt = 0

  get active(): boolean {
    return this.recorder !== null
  }

  async start(canvas: HTMLCanvasElement, audio: MediaStream | null, deviceName: string): Promise<void> {
    const { mime, ext } = pickFormat()
    // captureStream(n) only emits frames when the canvas is repainted. scrcpy sends no frames for
    // a static screen, so a 3 s recording came out ~1 s long. Pull frames at a steady rate instead.
    const stream = canvas.captureStream(0)
    const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack | undefined
    this.frameTimer = window.setInterval(() => track?.requestFrame(), 1000 / RECORD_FPS)
    for (const t of audio?.getAudioTracks() ?? []) stream.addTrack(t)
    this.id = await window.mobMirror.startRecording(deviceName, ext)
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 })
    rec.ondataavailable = (e) => {
      if (!e.data.size) return
      const id = this.id
      // Keep chunks in order: each write waits for the previous one.
      this.writes = this.writes.then(async () => window.mobMirror.writeRecording(id, new Uint8Array(await e.data.arrayBuffer())))
    }
    rec.start(1000)
    this.recorder = rec
    this.startedAt = performance.now()
  }

  /** Resolves with the saved file path. */
  async stop(): Promise<string | null> {
    const rec = this.recorder
    if (!rec) return null
    this.recorder = null
    clearInterval(this.frameTimer)
    await new Promise<void>((r) => {
      rec.onstop = () => r()
      rec.stop()
    })
    for (const t of rec.stream.getVideoTracks()) t.stop()
    await this.writes
    return window.mobMirror.stopRecording(this.id)
  }
}
