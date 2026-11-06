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
  /** First chunk-write failure (e.g. disk full); reported on stop, later chunks are skipped. */
  private writeError: Error | null = null
  private frameTimer = 0
  private starting = false
  startedAt = 0

  /** True while recording or while start() is still setting up (blocks double starts). */
  get active(): boolean {
    return this.recorder !== null || this.starting
  }

  async start(canvas: HTMLCanvasElement, audio: MediaStream | null, deviceName: string): Promise<void> {
    if (this.active) return
    this.starting = true
    this.writeError = null
    this.writes = Promise.resolve()
    let id = 0
    try {
      const { mime, ext } = pickFormat()
      // captureStream(n) only emits frames when the canvas is repainted. scrcpy sends no frames for
      // a static screen, so a 3 s recording came out ~1 s long. Pull frames at a steady rate instead.
      const stream = canvas.captureStream(0)
      const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack | undefined
      for (const t of audio?.getAudioTracks() ?? []) stream.addTrack(t)
      id = await window.mobMirror.startRecording(deviceName, ext)
      const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 })
      rec.ondataavailable = (e) => {
        if (!e.data.size) return
        // Keep chunks in order: each write waits for the previous one. A failure is recorded once
        // and never poisons the chain, so stop() can still close the file.
        this.writes = this.writes.then(async () => {
          if (this.writeError) return
          try {
            await window.mobMirror.writeRecording(id, new Uint8Array(await e.data.arrayBuffer()))
          } catch (err) {
            this.writeError = err instanceof Error ? err : new Error(String(err))
          }
        })
      }
      this.frameTimer = window.setInterval(() => track?.requestFrame(), 1000 / RECORD_FPS)
      rec.start(1000)
      this.id = id
      this.recorder = rec
      this.startedAt = performance.now()
    } catch (e) {
      clearInterval(this.frameTimer)
      if (id) await window.mobMirror.stopRecording(id).catch(() => null)
      throw e
    } finally {
      this.starting = false
    }
  }

  /** Resolves with the saved file path; rejects if any chunk failed to write. */
  async stop(): Promise<string | null> {
    const rec = this.recorder
    if (!rec) return null
    this.recorder = null
    clearInterval(this.frameTimer)
    let path: string | null = null
    try {
      await new Promise<void>((r) => {
        rec.onstop = () => r()
        rec.stop()
      })
      for (const t of rec.stream.getVideoTracks()) t.stop()
      await this.writes
    } finally {
      // Always close the file in main, even if writing failed.
      path = await window.mobMirror.stopRecording(this.id)
    }
    if (this.writeError) throw new Error(`recording incomplete (${this.writeError.message}); partial file: ${path}`)
    return path
  }
}
