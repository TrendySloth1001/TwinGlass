/**
 * Keyed counting semaphore: at most `max` tasks run at once per key (per phone). Bursts of adb
 * shell commands (lock poll + watchdog + unlock status + agents) otherwise all open their own
 * adb transport streams at once, which over Wi-Fi queues behind each other anyway and adds latency
 * to the commands that matter. FIFO, so nothing starves.
 */
export class KeyedLimiter {
  private running = new Map<string, number>()
  private waiting = new Map<string, (() => void)[]>()

  constructor(private readonly max: number) {}

  async run<T>(key: string, task: () => Promise<T>): Promise<T> {
    if ((this.running.get(key) ?? 0) >= this.max) {
      await new Promise<void>((resolve) => {
        const q = this.waiting.get(key) ?? []
        q.push(resolve)
        this.waiting.set(key, q)
      })
    }
    this.running.set(key, (this.running.get(key) ?? 0) + 1)
    try {
      return await task()
    } finally {
      const n = (this.running.get(key) ?? 1) - 1
      if (n) this.running.set(key, n)
      else this.running.delete(key)
      const q = this.waiting.get(key)
      const next = q?.shift()
      if (q && !q.length) this.waiting.delete(key)
      next?.()
    }
  }

  /** Tasks currently running for a key (tests / diagnostics). */
  active(key: string): number {
    return this.running.get(key) ?? 0
  }
}
