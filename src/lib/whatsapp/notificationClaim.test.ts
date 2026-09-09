/**
 * supabase/functions/_shared/notificationClaim.ts is the claim-before-send
 * guard for every reminder cron. It is import-free, so Vitest can drive it
 * against an in-memory stand-in for notification_log that enforces the same
 * unique key Postgres does — (organization_id, type, entity_id).
 *
 * The property under test: for one key, across any number of overlapping runs,
 * exactly one caller is told 'claimed' before a send happens.
 */

import { describe, it, expect } from 'vitest'
import {
  claimNotification,
  settleNotification,
} from '../../../supabase/functions/_shared/notificationClaim'

type Row = {
  id: number
  organization_id: string
  type: string
  entity_id: string
  status: string
  error_message: string | null
  sent_at: string
}

/** Minimal PostgREST-shaped fake: insert / update().eq()…or().select(). */
function fakeDb(seed: Row[] = []) {
  const rows: Row[] = [...seed]
  let nextId = rows.length + 1
  const key = (r: Pick<Row, 'organization_id' | 'type' | 'entity_id'>) =>
    `${r.organization_id}|${r.type}|${r.entity_id}`

  function table() {
    return {
      insert(values: Omit<Row, 'id' | 'sent_at' | 'error_message'> & Partial<Row>) {
        if (rows.some((r) => key(r) === key(values))) {
          return Promise.resolve({
            error: { code: '23505', message: 'duplicate key value violates unique constraint' },
          })
        }
        rows.push({
          id: nextId++,
          error_message: null,
          sent_at: new Date().toISOString(),
          ...values,
        } as Row)
        return Promise.resolve({ error: null })
      },
      update(patch: Partial<Row>) {
        const filters: Array<(r: Row) => boolean> = []
        const builder = {
          eq(col: keyof Row, v: unknown) {
            filters.push((r) => r[col] === v)
            return builder
          },
          or(expr: string) {
            // status.eq.failed,and(status.eq.pending,sent_at.lt.<iso>)
            const m = expr.match(/^status\.eq\.failed,and\(status\.eq\.pending,sent_at\.lt\.(.+)\)$/)
            if (!m) throw new Error(`unexpected or(): ${expr}`)
            const before = m[1]
            filters.push((r) => r.status === 'failed' || (r.status === 'pending' && r.sent_at < before))
            return builder
          },
          select() {
            const hit = rows.filter((r) => filters.every((f) => f(r)))
            for (const r of hit) Object.assign(r, patch)
            return Promise.resolve({ data: hit.map((r) => ({ id: r.id })), error: null })
          },
          then(resolve: (v: { error: null }) => void) {
            // awaited without .select() — settleNotification
            const hit = rows.filter((r) => filters.every((f) => f(r)))
            for (const r of hit) Object.assign(r, patch)
            resolve({ error: null })
          },
        }
        return builder
      },
    }
  }

  return { rows, from: () => table() }
}

const KEY = { orgId: 'org-1', type: 'homework_reminder', entityId: 'hw-1' }

describe('claimNotification', () => {
  it('lets exactly one of two overlapping runs send', async () => {
    const db = fakeDb()
    const [a, b] = await Promise.all([claimNotification(db, KEY), claimNotification(db, KEY)])
    expect([a, b].sort()).toEqual(['claimed', 'duplicate'])
    expect(db.rows).toHaveLength(1)
    expect(db.rows[0].status).toBe('pending')
  })

  it('refuses a key that is already sent', async () => {
    const db = fakeDb()
    expect(await claimNotification(db, KEY)).toBe('claimed')
    await settleNotification(db, { ...KEY, status: 'sent', errorMessage: null })
    expect(await claimNotification(db, KEY)).toBe('duplicate')
    expect(db.rows[0].status).toBe('sent')
  })

  it('retries a previous failure', async () => {
    const db = fakeDb()
    expect(await claimNotification(db, KEY)).toBe('claimed')
    await settleNotification(db, { ...KEY, status: 'failed', errorMessage: 'boom' })
    expect(await claimNotification(db, KEY)).toBe('claimed')
    expect(db.rows[0].status).toBe('pending')
    expect(db.rows[0].error_message).toBeNull()
  })

  it('takes over a pending claim whose run died an hour ago, but not a live one', async () => {
    const stale = fakeDb([
      {
        id: 1,
        organization_id: KEY.orgId,
        type: KEY.type,
        entity_id: KEY.entityId,
        status: 'pending',
        error_message: null,
        sent_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      },
    ])
    expect(await claimNotification(stale, KEY)).toBe('claimed')

    const live = fakeDb()
    expect(await claimNotification(live, KEY)).toBe('claimed')
    expect(await claimNotification(live, KEY)).toBe('duplicate')
  })

  it('fails closed when the ledger insert errors for any other reason', async () => {
    const db = {
      from: () => ({
        insert: () => Promise.resolve({ error: { code: '42P01', message: 'relation missing' } }),
      }),
    }
    expect(await claimNotification(db, KEY)).toBe('error')
  })
})
