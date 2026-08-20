/**
 * Live-refresh listener registry — the framework-free core of src/lib/realtime.
 *
 * The React layer (LiveRefreshProvider) owns exactly one Supabase Realtime
 * channel per organization and feeds every row change into `dispatch(table)`.
 * This module decides who gets woken up. It is deliberately plain TypeScript so
 * the interesting parts — fan-out by table, unsubscribe, and burst coalescing —
 * are unit-testable without a DOM.
 *
 * Why one channel rather than one per component: a websocket per mounted widget
 * would open a dozen connections on a busy dashboard and re-open them on every
 * navigation. Subscriptions must also be registered on a channel *before*
 * `.subscribe()`, so the table list is fixed up front (WATCHED_TABLES) and
 * components attach to the shared stream instead of opening their own.
 */

/**
 * Tables the dashboard subscribes to. Fixed at connect time.
 *
 * Adding a table here is not enough on its own — it must also be added to the
 * `supabase_realtime` publication (see the migration accompanying this module)
 * and be readable under RLS by the signed-in user, or no event will ever arrive.
 */
export const WATCHED_TABLES = [
  'charges',
  'lessons',
  'leads',
  'portal_messages',
  'availability',
  'availability_overrides',
  'in_app_notifications',
] as const

export type WatchedTable = (typeof WATCHED_TABLES)[number]

export function isWatchedTable(table: string): table is WatchedTable {
  return (WATCHED_TABLES as readonly string[]).includes(table)
}

type Listener = {
  tables: readonly string[]
  fire: () => void
}

export type LiveRefreshRegistry = {
  /** Registers a listener; returns its unsubscribe function. */
  add: (tables: readonly string[], fire: () => void) => () => void
  /** Wakes every listener watching `table`. Unknown tables are ignored. */
  dispatch: (table: string) => void
  /** Listener count — for tests and debugging. */
  size: () => number
}

export function createRegistry(): LiveRefreshRegistry {
  const listeners = new Set<Listener>()

  return {
    add(tables, fire) {
      const listener: Listener = { tables, fire }
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    dispatch(table) {
      // Iterate a copy: a listener that unsubscribes itself while firing would
      // otherwise mutate the set mid-iteration.
      for (const listener of [...listeners]) {
        if (!listener.tables.includes(table)) continue
        try {
          listener.fire()
        } catch (err) {
          // One broken listener must not stop the others from being notified.
          console.error('[realtime] listener threw', err)
        }
      }
    },

    size: () => listeners.size,
  }
}

/**
 * Wraps a callback so a burst of row changes produces one call, not fifty.
 *
 * Approving a month of billing writes a charge row per student; without this,
 * each one would trigger its own `router.refresh()` and the page would thrash.
 * Trailing-edge on purpose — the last event in a burst is the one whose state
 * we want to render.
 */
export function coalesce(
  fn: () => void,
  windowMs: number
): { call: () => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null

  return {
    call() {
      if (timer !== null) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        fn()
      }, windowMs)
    },
    cancel() {
      if (timer !== null) clearTimeout(timer)
      timer = null
    },
  }
}
