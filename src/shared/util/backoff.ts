/**
 * Exponential backoff with "equal jitter" (AWS Architecture Blog, "Exponential Backoff And
 * Jitter"): half the delay is fixed, half random, so retries from several windows don't line up
 * while there is still a guaranteed minimum wait.
 * @param attempt 0-based retry number
 * @param rand    injectable for tests; returns [0, 1)
 */
export function backoffDelay(attempt: number, baseMs = 500, capMs = 4000, rand: () => number = Math.random): number {
  const exp = Math.min(capMs, baseMs * 2 ** Math.max(0, attempt))
  return Math.round(exp / 2 + rand() * (exp / 2))
}
