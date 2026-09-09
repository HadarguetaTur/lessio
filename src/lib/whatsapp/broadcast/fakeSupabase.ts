/**
 * A tiny in-memory stand-in for the service-role client, for the drain tests.
 *
 * The broadcast bugs worth writing tests for are all about ORDER — a Stop that
 * lands between two cron ticks, a remainder that has to survive to the next day,
 * two workers claiming the same row. None of that can be asserted against
 * per-call `vi.fn()` mocks, because there is no state for the second call to see.
 * So this keeps real rows in real arrays and lets the code under test read back
 * what it wrote.
 *
 * It is deliberately not a Postgres: it supports exactly the query shapes
 * `send.ts` and `consent.ts` use, and throws on anything else rather than
 * quietly returning the wrong rows. Test-only — nothing imports it at runtime.
 */

type Row = Record<string, unknown>

type Filter = { op: 'eq' | 'neq' | 'gte' | 'lte' | 'lt' | 'gt' | 'in' | 'is'; col: string; value: unknown }

function matches(row: Row, f: Filter): boolean {
  // A dotted column is an embedded-resource filter (campaign.template_type).
  // Nothing here joins, so such a row never matches — which is what the
  // frequency lookup wants when there is no history to find.
  if (f.col.includes('.')) return false
  const actual = row[f.col]
  switch (f.op) {
    case 'eq':
      return actual === f.value
    case 'neq':
      return actual !== f.value
    case 'is':
      return f.value === null ? actual === null || actual === undefined : actual === f.value
    case 'in':
      return (f.value as unknown[]).includes(actual)
    case 'gte':
      return actual != null && String(actual) >= String(f.value)
    case 'lte':
      return actual != null && String(actual) <= String(f.value)
    case 'lt':
      return actual != null && String(actual) < String(f.value)
    case 'gt':
      return actual != null && String(actual) > String(f.value)
  }
}

export interface FakeDb {
  tables: Record<string, Row[]>
  from(table: string): Builder
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: Row[] | null; error: null }>
}

class Builder {
  private filters: Filter[] = []
  private mode: 'select' | 'update' | 'upsert' | 'insert' | 'delete' = 'select'
  private payload: Row | Row[] = {}
  private wantsCount = false
  private headOnly = false
  private orderBy: { col: string; asc: boolean } | null = null
  private limitTo: number | null = null
  private conflict: string[] = []
  private ignoreDuplicates = false

  constructor(private rows: Row[]) {}

  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    if (this.mode === 'select') this.mode = 'select'
    if (opts?.count) this.wantsCount = true
    if (opts?.head) this.headOnly = true
    return this
  }
  update(payload: Row) {
    this.mode = 'update'
    this.payload = payload
    return this
  }
  insert(payload: Row | Row[]) {
    this.mode = 'insert'
    this.payload = payload
    return this
  }
  upsert(payload: Row | Row[], opts?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.mode = 'upsert'
    this.payload = payload
    this.conflict = opts?.onConflict?.split(',').map((s) => s.trim()) ?? []
    this.ignoreDuplicates = opts?.ignoreDuplicates ?? false
    return this
  }
  delete() {
    this.mode = 'delete'
    return this
  }

  eq(col: string, value: unknown) { return this.push('eq', col, value) }
  neq(col: string, value: unknown) { return this.push('neq', col, value) }
  gte(col: string, value: unknown) { return this.push('gte', col, value) }
  lte(col: string, value: unknown) { return this.push('lte', col, value) }
  lt(col: string, value: unknown) { return this.push('lt', col, value) }
  gt(col: string, value: unknown) { return this.push('gt', col, value) }
  in(col: string, value: unknown[]) { return this.push('in', col, value) }
  is(col: string, value: unknown) { return this.push('is', col, value) }
  not(col: string, _op: string, value: unknown) { return this.push('neq', col, value) }

  order(col: string, opts?: { ascending?: boolean }) {
    this.orderBy = { col, asc: opts?.ascending !== false }
    return this
  }
  limit(n: number) {
    this.limitTo = n
    return this
  }

  private push(op: Filter['op'], col: string, value: unknown) {
    this.filters.push({ op, col, value })
    return this
  }

  private hits(): Row[] {
    let out = this.rows.filter((r) => this.filters.every((f) => matches(r, f)))
    if (this.orderBy) {
      const { col, asc } = this.orderBy
      out = [...out].sort((a, b) => {
        const x = String(a[col] ?? ''), y = String(b[col] ?? '')
        return asc ? x.localeCompare(y) : y.localeCompare(x)
      })
    }
    if (this.limitTo !== null) out = out.slice(0, this.limitTo)
    return out
  }

  private run(): { data: Row[] | null; error: null; count?: number } {
    if (this.mode === 'update') {
      const hits = this.hits()
      for (const row of hits) Object.assign(row, this.payload)
      return { data: hits, error: null }
    }
    if (this.mode === 'insert' || this.mode === 'upsert') {
      const incoming = Array.isArray(this.payload) ? this.payload : [this.payload]
      const written: Row[] = []
      for (const row of incoming) {
        const existing =
          this.conflict.length > 0
            ? this.rows.find((r) => this.conflict.every((c) => r[c] === row[c]))
            : undefined
        if (existing) {
          if (!this.ignoreDuplicates) Object.assign(existing, row)
          written.push(existing)
        } else {
          const stored = { id: `row-${this.rows.length + 1}-${Math.random().toString(36).slice(2, 8)}`, ...row }
          this.rows.push(stored)
          written.push(stored)
        }
      }
      return { data: written, error: null }
    }
    if (this.mode === 'delete') {
      for (const row of this.hits()) this.rows.splice(this.rows.indexOf(row), 1)
      return { data: null, error: null }
    }
    const hits = this.hits()
    if (this.wantsCount) return { data: this.headOnly ? null : hits, error: null, count: hits.length }
    return { data: hits, error: null }
  }

  async maybeSingle() {
    const { data, error } = this.run()
    return { data: (data ?? [])[0] ?? null, error }
  }
  async single() {
    return this.maybeSingle()
  }
  then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
    return Promise.resolve(this.run()).then(resolve, reject)
  }
}

/**
 * `claim_broadcast_recipients`, transcribed from the migration: only rows of a
 * campaign that is `sending`, either pending or with an expired lease, oldest
 * first, flipped to `claimed` in the same step that returns them.
 */
function claimBroadcastRecipients(db: FakeDb, args: Record<string, unknown>): Row[] {
  const now = new Date(String(args.p_now)).getTime()
  const leaseMs = 10 * 60 * 1000
  const limit = Math.max(1, Math.min(Number(args.p_limit ?? 20), 50))

  const sending = new Set(
    (db.tables.broadcast_campaigns ?? []).filter((c) => c.status === 'sending').map((c) => c.id)
  )

  const eligible = (db.tables.broadcast_recipients ?? [])
    .filter((r) => sending.has(r.campaign_id))
    .filter(
      (r) =>
        r.status === 'pending' ||
        (r.status === 'claimed' &&
          r.claimed_at != null &&
          new Date(String(r.claimed_at)).getTime() < now - leaseMs)
    )
    .sort((a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')))
    .slice(0, limit)

  for (const r of eligible) {
    r.status = 'claimed'
    r.claimed_at = new Date(now).toISOString()
  }
  // The RPC returns a snapshot; later mutations of the stored row must not
  // retroactively change what this tick was handed.
  return eligible.map((r) => ({ ...r }))
}

export function createFakeDb(seed: Record<string, Row[]> = {}): FakeDb {
  const tables: Record<string, Row[]> = { ...seed }
  const db: FakeDb = {
    tables,
    from(table: string) {
      tables[table] ??= []
      return new Builder(tables[table]) as unknown as Builder
    },
    async rpc(name: string, args: Record<string, unknown>) {
      if (name !== 'claim_broadcast_recipients') throw new Error(`fakeDb: unknown rpc ${name}`)
      return { data: claimBroadcastRecipients(db, args), error: null }
    },
  }
  return db
}
