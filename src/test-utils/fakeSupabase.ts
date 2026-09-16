/**
 * A tiny in-memory stand-in for the supabase-js query builder, for tests of
 * server code that reads and writes several tables in one flow.
 *
 * Supports the subset the billing code uses: select (columns ignored, rows
 * returned whole), eq / neq / in / is / gte / lt filters, insert, update,
 * single / maybeSingle, and awaiting a list query directly. `rpc` calls are
 * routed to handlers the test registers.
 */

type Row = Record<string, unknown>
type Filter = (row: Row) => boolean

export interface FakeDb {
  tables: Record<string, Row[]>
  rpcHandlers: Record<string, (args: Record<string, unknown>) => unknown>
  client: { from: (table: string) => unknown; rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: null }> }
  /** Every insert/update, in order: [table, op, payload]. */
  writes: Array<[string, 'insert' | 'update', Row]>
}

let idCounter = 0

export function createFakeDb(tables: Record<string, Row[]> = {}): FakeDb {
  const db: FakeDb = {
    tables,
    rpcHandlers: {},
    writes: [],
    client: {
      from: (table: string) => builder(db, table),
      rpc: async (name, args) => {
        const handler = db.rpcHandlers[name]
        if (!handler) throw new Error(`fakeSupabase: no rpc handler for ${name}`)
        return { data: handler(args), error: null }
      },
    },
  }
  return db
}

function builder(db: FakeDb, table: string) {
  const filters: Filter[] = []
  let op: 'select' | 'insert' | 'update' = 'select'
  let payload: Row | Row[] | null = null

  const rows = () => (db.tables[table] ??= [])

  const run = (): Row[] => {
    if (op === 'insert') {
      const list = Array.isArray(payload) ? payload : [payload as Row]
      const inserted = list.map((r) => ({ id: `${table}-${++idCounter}`, ...r }))
      for (const r of inserted) {
        rows().push(r)
        db.writes.push([table, 'insert', r])
      }
      return inserted
    }
    const matched = rows().filter((r) => filters.every((f) => f(r)))
    if (op === 'update') {
      for (const r of matched) {
        Object.assign(r, payload)
        db.writes.push([table, 'update', { ...(payload as Row), __id: r.id }])
      }
    }
    return matched
  }

  const chain: Record<string, unknown> = {
    select: () => chain,
    insert: (value: Row | Row[]) => { op = 'insert'; payload = value; return chain },
    update: (value: Row) => { op = 'update'; payload = value; return chain },
    eq: (col: string, v: unknown) => { filters.push((r) => r[col] === v); return chain },
    neq: (col: string, v: unknown) => { filters.push((r) => r[col] !== v); return chain },
    in: (col: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[col])); return chain },
    is: (col: string, v: unknown) => { filters.push((r) => (r[col] ?? null) === v); return chain },
    gte: (col: string, v: string) => { filters.push((r) => String(r[col]) >= v); return chain },
    lt: (col: string, v: string) => { filters.push((r) => String(r[col]) < v); return chain },
    lte: (col: string, v: string | number) => { filters.push((r) => (typeof v === 'number' ? Number(r[col]) <= v : String(r[col]) <= v)); return chain },
    gt: (col: string, v: string | number) => { filters.push((r) => (typeof v === 'number' ? Number(r[col]) > v : String(r[col]) > v)); return chain },
    contains: (col: string, vs: unknown[]) => { filters.push((r) => Array.isArray(r[col]) && vs.every((v) => (r[col] as unknown[]).includes(v))); return chain },
    not: (col: string, op: string, v: unknown) => { filters.push((r) => (op === 'is' ? (r[col] ?? null) !== v : r[col] !== v)); return chain },
    // PostgREST or-strings are not interpreted; tests seed only matching rows.
    or: () => chain,
    order: () => chain,
    limit: () => chain,
    single: async () => {
      const out = run()
      return out.length === 1 ? { data: out[0], error: null } : { data: null, error: { message: 'not single' } }
    },
    maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
    then: (resolve: (v: { data: Row[]; error: null }) => unknown, reject?: (e: unknown) => unknown) => {
      try {
        return Promise.resolve(resolve({ data: run(), error: null }))
      } catch (e) {
        return reject ? reject(e) : Promise.reject(e)
      }
    },
  }
  return chain
}
