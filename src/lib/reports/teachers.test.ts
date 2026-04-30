import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getTeachersReport } from './teachers'

let lessonsGteValue: string | null = null
let chargesGteValue: string | null = null

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({ from: (table: string) => buildTableChain(table) }),
}))

describe('getTeachersReport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-15T12:00:00.000Z'))
    lessonsGteValue = null
    chargesGteValue = null
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses an inclusive rolling month window that matches other reports', async () => {
    const result = await getTeachersReport('org-1', 'UTC', 3)

    expect(result.rows).toEqual([])
    expect(lessonsGteValue).toBe('2026-02-01T00:00:00.000Z')
    expect(chargesGteValue).toBe('2026-02-01T00:00:00.000Z')
  })
})

function buildTableChain(table: string) {
  const result = { data: [] as unknown[], error: null }
  const self: Record<string, unknown> = {}
  const pass = () => self

  ;['select', 'eq', 'neq'].forEach((method) => {
    self[method] = pass
  })

  self['gte'] = (_field: string, value: string) => {
    if (table === 'lessons') lessonsGteValue = value
    if (table === 'charges') chargesGteValue = value
    return self
  }

  self['then'] = (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve)

  return self
}
