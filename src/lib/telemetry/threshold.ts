/**
 * When does a repeating error become a bug someone must fix? — Sprint 32 M3.
 *
 * SYNC: mirrored in supabase/functions/error-monitor/index.ts (`crossesThreshold`).
 * Deno cannot import from src/, and Vitest does not scan supabase/functions/,
 * so the logic lives here where it can be tested and is copied there where it
 * runs — the same arrangement as DEFAULT_TEMPLATES. Update both together.
 */

/** Enough repeats within one org that it is clearly not a one-off fluke. */
export const MIN_EVENTS = 5

/**
 * A lower bar when more than one org is affected. One org hitting an error
 * three times might be one person retrying a bad input; three hits spread
 * across two orgs is the product misbehaving, and blast radius matters more
 * than raw volume.
 */
export const MIN_EVENTS_MULTI_ORG = 3
export const MIN_ORGS_FOR_MULTI = 2

export interface FingerprintStats {
  eventCount: number
  orgCount: number
}

export function crossesThreshold(stats: FingerprintStats): boolean {
  if (stats.eventCount >= MIN_EVENTS) return true
  return stats.orgCount >= MIN_ORGS_FOR_MULTI && stats.eventCount >= MIN_EVENTS_MULTI_ORG
}
