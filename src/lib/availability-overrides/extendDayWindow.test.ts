import { describe, it, expect, vi, beforeEach } from 'vitest'
import { extendDayWindow } from './extendDayWindow'

const mockFrom = vi.fn()
const inserted: unknown[] = []
const updated: { id: string; patch: Record<string, unknown> }[] = []

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({ from: (table: string) => mockFrom(table) }),
}))

const ORG_ID = 'org-1'
const TEACHER_ID = 'teacher-1'
const DATE = '2026-03-23' // Monday

function chain(result: unknown, hooks: Record<string, unknown> = {}) {
  const self: Record<string, unknown> = {}
  const pass = () => self
  ;['select', 'eq', 'gte', 'lte', 'gt', 'lt', 'neq', 'order', 'limit'].forEach((m) => {
    self[m] = pass
  })
  self['single'] = () => Promise.resolve(result)
  self['maybeSingle'] = () => Promise.resolve(result)
  self['then'] = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
    Promise.resolve(result).then(res, rej)
  Object.assign(self, hooks)
  return self
}

function setup(o: {
  weekly?: { start_time: string; end_time: string }[]
  overrides?: { id?: string; is_available: boolean; start_time: string | null; end_time: string | null }[]
}) {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'organizations') return chain({ data: { timezone: 'UTC' }, error: null })
    if (table === 'availability') return chain({ data: o.weekly ?? [], error: null })
    if (table === 'availability_overrides') {
      return chain(
        { data: o.overrides ?? [], error: null },
        {
          insert: (rows: unknown) => {
            inserted.push(...(Array.isArray(rows) ? rows : [rows]))
            return chain({ data: null, error: null })
          },
          update: (patch: Record<string, unknown>) => {
            const target = chain({ data: null, error: null })
            // Capture the id the update is scoped to.
            ;(target as Record<string, unknown>)['eq'] = (col: string, value: string) => {
              if (col === 'id') updated.push({ id: value, patch })
              return target
            }
            return target
          },
        }
      )
    }
    return chain({ data: [], error: null })
  })
}

const extend = (newEndTime: string) =>
  extendDayWindow({ orgId: ORG_ID, teacherId: TEACHER_ID, date: DATE, newEndTime })

describe('extendDayWindow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    inserted.length = 0
    updated.length = 0
  })

  // The point of the whole function: special_hours REPLACE the weekly grid for
  // a date, so writing only the evening would delete the morning from that day.
  it('materialises every window of the day, extending only the last', async () => {
    setup({
      weekly: [
        { start_time: '09:00:00', end_time: '11:00:00' },
        { start_time: '16:00:00', end_time: '19:30:00' },
      ],
    })

    expect(await extend('20:00')).toBeNull()

    expect(inserted).toEqual([
      expect.objectContaining({
        override_date: DATE,
        is_available: true,
        start_time: '09:00',
        end_time: '11:00',
      }),
      expect.objectContaining({
        override_date: DATE,
        is_available: true,
        start_time: '16:00',
        end_time: '20:00',
      }),
    ])
  })

  it('updates the existing special-hours row instead of stacking another', async () => {
    setup({
      overrides: [
        { id: 'sh-1', is_available: true, start_time: '09:00:00', end_time: '11:00:00' },
        { id: 'sh-2', is_available: true, start_time: '16:00:00', end_time: '19:30:00' },
      ],
    })

    expect(await extend('20:00')).toBeNull()

    expect(inserted).toEqual([])
    expect(updated).toEqual([{ id: 'sh-2', patch: { end_time: '20:00' } }])
  })

  it('refuses an end time that is not actually later', async () => {
    setup({ weekly: [{ start_time: '16:00:00', end_time: '19:30:00' }] })

    expect(await extend('19:30')).toEqual({ key: 'extendTooEarly' })
    expect(inserted).toEqual([])
  })

  // `end_time` is a `time` column: there is no next day for it to roll into.
  it('refuses to extend past midnight', async () => {
    setup({ weekly: [{ start_time: '16:00:00', end_time: '23:30:00' }] })

    expect(await extend('24:30')).toEqual({ key: 'extendPastMidnight' })
    expect(inserted).toEqual([])
  })

  it('refuses when the day has no windows to extend', async () => {
    setup({ weekly: [] })

    expect(await extend('20:00')).toEqual({ key: 'resolveFailed' })
  })

  it('refuses on a day the teacher closed outright', async () => {
    setup({
      weekly: [{ start_time: '16:00:00', end_time: '19:30:00' }],
      overrides: [{ is_available: false, start_time: null, end_time: null }],
    })

    expect(await extend('20:00')).toEqual({ key: 'resolveFailed' })
  })

  // Blocks stay: they keep subtracting from the newly written windows, which is
  // the reader contract those two row kinds are built on.
  it('leaves a blocked range on the date alone', async () => {
    setup({
      weekly: [{ start_time: '16:00:00', end_time: '19:30:00' }],
      overrides: [{ id: 'b-1', is_available: false, start_time: '17:00:00', end_time: '17:30:00' }],
    })

    expect(await extend('20:00')).toBeNull()

    expect(updated).toEqual([])
    expect(inserted).toEqual([
      expect.objectContaining({ is_available: true, start_time: '16:00', end_time: '20:00' }),
    ])
  })
})
