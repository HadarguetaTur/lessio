/**
 * In-memory sliding-window rate limiter for the unauthenticated telemetry
 * routes.
 *
 * Deliberately not the DB: this exists to stop a loop hammering us, and a rate
 * limiter that writes a row per rejected request is not a rate limiter.
 * Per-instance state is fine for that job.
 */
export function createSlidingWindow(options: { max: number; windowMs: number; maxKeys?: number }) {
  const { max, windowMs, maxKeys = 5_000 } = options
  const hits = new Map<string, number[]>()

  /** Records a hit and reports whether the key is now over its limit. */
  return function isRateLimited(key: string, now: number = Date.now()): boolean {
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs)
    recent.push(now)
    hits.set(key, recent)

    // Bound the map so a rotating-key flood cannot grow it without limit.
    if (hits.size > maxKeys) {
      for (const [k, times] of hits) {
        if (times.every((t) => now - t >= windowMs)) hits.delete(k)
      }
    }

    return recent.length > max
  }
}
