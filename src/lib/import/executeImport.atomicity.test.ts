/**
 * A failed chunk used to be skipped while the loop carried on, so the chunks
 * either side of it committed. With no batch id and no undo, the owner's only
 * move was to press the button again — which re-posted a preview where every
 * row still claimed to be new, duplicating everything that had landed.
 */
process.env.TZ = 'UTC'

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ValidatedRow } from './validators'

type Row = Record<string, unknown>

/** Rows currently in the fake database, keyed by table. */
const db: Record<string, Row[]> = {}
/** Tables the next insert should fail on, with the error to return. */
let failNextInsertOn: { table: string; onCall: number } | null = null
const insertCalls: Record<string, number> = {}
let seq = 0

vi.mock('@/lib/saas/quota', () => ({
  requireQuotaCapacity: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => fakeClient(),
}))

function fakeClient() {
  return {
    from(table: string) {
      return {
        select: () => ({
          eq() {
            return this
          },
          then: (r: (v: unknown) => unknown) =>
            Promise.resolve({ data: db[table] ?? [], error: null }).then(r),
        }),
        insert(payload: Row | Row[]) {
          insertCalls[table] = (insertCalls[table] ?? 0) + 1

          if (failNextInsertOn?.table === table && insertCalls[table] === failNextInsertOn.onCall) {
            const failure = { data: null, error: { message: 'connection reset', code: '08006' } }
            return {
              select: () => ({
                single: () => Promise.resolve(failure),
                then: (r: (v: unknown) => unknown) => Promise.resolve(failure).then(r),
              }),
              then: (r: (v: unknown) => unknown) => Promise.resolve(failure).then(r),
            }
          }

          const rows = (Array.isArray(payload) ? payload : [payload]).map((r) => ({
            ...r,
            id: `${table}-${++seq}`,
          }))
          db[table] = [...(db[table] ?? []), ...rows]
          const ok = { data: rows, error: null }
          return {
            select: () => ({
              single: () => Promise.resolve({ data: rows[0], error: null }),
              then: (r: (v: unknown) => unknown) => Promise.resolve(ok).then(r),
            }),
            then: (r: (v: unknown) => unknown) => Promise.resolve(ok).then(r),
          }
        },
        delete: () => ({
          in(_col: string, ids: string[]) {
            db[table] = (db[table] ?? []).filter((r) => !ids.includes(r.id as string))
            return Promise.resolve({ error: null })
          },
        }),
      }
    },
  } as never
}

const t = (key: string) => key

function studentRows(count: number): ValidatedRow[] {
  return Array.from({ length: count }, (_, i) => ({
    rowIndex: i,
    status: 'valid' as const,
    data: { full_name: `תלמיד ${i + 1}` },
    errors: [],
    warnings: [],
  }))
}

async function run(rows: ValidatedRow[]) {
  const { executeImport } = await import('./executeImport')
  return executeImport('org-1', 'students', rows, 'Asia/Jerusalem', t)
}

beforeEach(() => {
  for (const key of Object.keys(db)) delete db[key]
  for (const key of Object.keys(insertCalls)) delete insertCalls[key]
  failNextInsertOn = null
  seq = 0
})

describe('a failed chunk is all-or-nothing', () => {
  it('rolls back the chunks that already committed', async () => {
    // 120 rows at BATCH_SIZE 50 = three chunks; the second one fails.
    failNextInsertOn = { table: 'students', onCall: 2 }

    const result = await run(studentRows(120))

    expect(result.rolledBack).toBe(true)
    expect(result.inserted).toBe(0)
    // Chunk 1 committed before the failure and was undone.
    expect(db.students ?? []).toEqual([])
    // The owner is told which row it stopped on and that nothing was kept.
    expect(result.errors.map((e) => e.message)).toContain('executeErrors.rolledBack')
    // Row 52 is the first row of the second chunk — the one that failed.
    expect(result.errors[0].row).toBe(52)
  })

  it('does not run the chunks after the failure', async () => {
    failNextInsertOn = { table: 'students', onCall: 2 }
    await run(studentRows(120))
    expect(insertCalls.students).toBe(2)
  })

  it('keeps everything when no chunk fails', async () => {
    const result = await run(studentRows(120))
    expect(result.rolledBack).toBeUndefined()
    expect(result.inserted).toBe(120)
    expect(db.students).toHaveLength(120)
  })
})

describe('a compound lesson import unwinds completely', () => {
  it('removes the series and its lessons when an enrolment fails', async () => {
    db.teachers = [{ id: 'teacher-1', profile: { full_name: 'רות לוי' } }]
    db.students = [{ id: 'student-1', full_name: 'דנה כהן' }]
    // The third lesson_students insert fails, after a series and lessons exist.
    failNextInsertOn = { table: 'lesson_students', onCall: 3 }

    const { executeImport } = await import('./executeImport')
    const result = await executeImport(
      'org-1',
      'lessons-schedule',
      [
        {
          rowIndex: 0,
          status: 'valid',
          data: {
            teacher_name: 'רות לוי',
            student_name: 'דנה כהן',
            day_of_week: '2',
            start_time: '16:00',
            duration_minutes: '60',
          },
          errors: [],
          warnings: [],
        },
      ],
      'Asia/Jerusalem',
      t
    )

    expect(result.rolledBack).toBe(true)
    // No orphan series, no orphan lessons, no half-enrolled student.
    expect(db.lesson_series ?? []).toEqual([])
    expect(db.lessons ?? []).toEqual([])
    expect(db.lesson_students ?? []).toEqual([])
  })
})

describe('retrying the same preview', () => {
  it('duplicates everything when the stale preview is simply re-posted', async () => {
    // This is the behaviour the idempotency key exists to prevent: the rows the
    // client holds still say `existingId: null` after a successful run.
    const rows = studentRows(3)
    await run(rows)
    await run(rows)
    expect(db.students).toHaveLength(6)
  })
})
