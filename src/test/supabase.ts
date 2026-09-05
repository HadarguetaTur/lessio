/**
 * A fake Supabase query builder that records the filters applied to it.
 *
 * Not a test suite — a helper for them. It lives under src/test/ rather than
 * src/lib/ so vitest does not collect it and coverage does not count it.
 *
 * Why record filters rather than just stub data: the tenant-isolation bugs this
 * codebase has actually shipped were all the same shape — a query that forgot
 * `.eq('organization_id', orgId)` while running on the service-role client,
 * which bypasses RLS. Asserting on returned rows cannot catch that, because a
 * test fixture only contains rows the test put there. Asserting that the query
 * *carried the org filter* catches it directly.
 *
 * Usage:
 *   const db = recordingClient({ data: { id: 'x' } })
 *   mockCreateServiceRoleClient.mockReturnValue(db.client)
 *   await someAction(...)
 *   expect(db.filters('students')).toMatchObject({ 'eq:organization_id': ORG_A })
 */

import { vi } from 'vitest'

export interface RecordedQuery {
  table: string
  filters: Record<string, unknown>
}

export interface RecordingClient {
  client: { from: ReturnType<typeof vi.fn> }
  /** Every query issued, in order. */
  queries: RecordedQuery[]
  /** Filters for the first query against `table`, or undefined if never queried. */
  filters: (table: string) => Record<string, unknown> | undefined
  /** Every table the code under test touched. */
  tables: () => string[]
}

export interface RecordingClientOptions {
  /**
   * Result for terminal calls. Either one value for every table, or a map from
   * table name to that table's result.
   */
  data?: unknown | Record<string, unknown>
  error?: { message: string } | null
  /** Rows returned by a non-terminal (list) await, per table or for all. */
  count?: number
}

/**
 * Builds a chainable stand-in for `createServiceRoleClient()` / `createClient()`.
 *
 * Every filter method records `"<method>:<column>" -> value` and returns the
 * builder, so a chain of any shape resolves. Terminal methods (`single`,
 * `maybeSingle`) and awaiting the builder itself both yield `{ data, error }`.
 */
export function recordingClient(options: RecordingClientOptions = {}): RecordingClient {
  const queries: RecordedQuery[] = []

  function resultFor(table: string): { data: unknown; error: unknown; count: number | null } {
    const { data, error = null, count = null } = options
    const isTableMap =
      data !== null &&
      typeof data === 'object' &&
      !Array.isArray(data) &&
      Object.prototype.hasOwnProperty.call(data ?? {}, table)

    return {
      data: isTableMap ? (data as Record<string, unknown>)[table] : (data ?? null),
      error,
      count,
    }
  }

  const from = vi.fn((table: string) => {
    const filters: Record<string, unknown> = {}
    queries.push({ table, filters })

    const builder: Record<string, unknown> = {}

    /** Records `column -> value` under the method's name and keeps chaining. */
    const filter = (method: string) =>
      vi.fn((column: string, value: unknown) => {
        filters[`${method}:${column}`] = value
        return builder
      })

    /** Methods that take no column, e.g. `.or('a.eq.1,b.eq.2')`. */
    const bare = (method: string) =>
      vi.fn((expression: unknown) => {
        filters[method] = expression
        return builder
      })

    /** Methods that only shape the result and carry no tenant meaning. */
    const passthrough = () => vi.fn(() => builder)

    Object.assign(builder, {
      select: vi.fn((columns?: string) => {
        if (columns !== undefined) filters['select'] = columns
        return builder
      }),
      insert: bare('insert'),
      update: bare('update'),
      upsert: bare('upsert'),
      delete: passthrough(),

      eq: filter('eq'),
      neq: filter('neq'),
      gt: filter('gt'),
      gte: filter('gte'),
      lt: filter('lt'),
      lte: filter('lte'),
      like: filter('like'),
      ilike: filter('ilike'),
      in: filter('in'),
      contains: filter('contains'),
      is: filter('is'),
      or: bare('or'),
      match: bare('match'),

      order: passthrough(),
      limit: passthrough(),
      range: passthrough(),

      single: async () => resultFor(table),
      maybeSingle: async () => resultFor(table),
      // Awaiting the builder directly (a list query) resolves the same way.
      then: (resolve: (v: unknown) => unknown) => resolve(resultFor(table)),
    })

    return builder
  })

  return {
    client: { from },
    queries,
    filters: (table: string) => queries.find((q) => q.table === table)?.filters,
    tables: () => queries.map((q) => q.table),
  }
}

/**
 * Asserts a query against `table` was scoped to `orgId`.
 * Throws with a readable message naming the tables that were touched.
 */
export function expectScopedToOrg(
  recorder: RecordingClient,
  table: string,
  orgId: string
): void {
  const filters = recorder.filters(table)
  if (!filters) {
    throw new Error(
      `Expected a query against "${table}" scoped to org ${orgId}, ` +
        `but that table was never queried. Tables touched: ${recorder.tables().join(', ') || '(none)'}`
    )
  }
  if (filters['eq:organization_id'] !== orgId) {
    throw new Error(
      `Query against "${table}" was not scoped to org ${orgId}. ` +
        `Filters recorded: ${JSON.stringify(filters)}`
    )
  }
}
