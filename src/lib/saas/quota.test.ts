import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockFrom = vi.fn()

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({ from: (table: string) => mockFrom(table) }),
}))

vi.mock('./subscriptions', () => ({
  getEffectiveSaasPlan: vi.fn(),
}))

import { requireQuotaCapacity, getOrgQuotaUsage, QuotaExceededError } from './quota'
import { getEffectiveSaasPlan } from './subscriptions'
import type { SaasPlanRow } from './plans'

const mockPlan = vi.mocked(getEffectiveSaasPlan)

/**
 * A plan row as getEffectiveSaasPlan returns it.
 *
 * Typed `: SaasPlanRow` deliberately. It used to be an untyped literal, which
 * meant a newly added quota column read back as `undefined` here — and
 * `undefined == null` is "unlimited", so tests for that new column would have
 * passed vacuously. Typing it turns every future column addition into a
 * compile error in this file.
 */
function plan(overrides: Partial<SaasPlanRow>): SaasPlanRow {
  return {
    id: 'plan-1',
    name: 'studio',
    display_name_he: 'סטודיו',
    display_name_en: 'Studio',
    price_monthly: 349,
    price_yearly: 3490,
    features: {
      whatsapp_automation: true,
      ai_assistant: true,
      full_reports: true,
      leads: true,
      homework: true,
      parent_portal: true,
      integrations: true,
      data_retention: true,
    },
    sort_order: 20,
    students_quota: null,
    lessons_monthly_quota: null,
    teachers_quota: null,
    ...overrides,
  }
}

/** A count query: .select(...) then any chain of filters, resolving to { count }. */
function countChain(count: number) {
  const chain: Record<string, unknown> = {}
  chain.eq = () => chain
  chain.neq = () => chain
  chain.not = () => chain
  chain.gte = () => chain
  chain.lt = () => chain
  chain.then = (resolve: (v: unknown) => unknown) => resolve({ count, error: null })
  return { select: () => chain }
}

describe('requireQuotaCapacity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('enforces the students quota', async () => {
    // Regression guard. The quota columns were absent from every select in
    // plans.ts, so the limit always read back as undefined and `undefined ==
    // null` short-circuited the check — no plan ever enforced anything.
    mockPlan.mockResolvedValue(plan({ students_quota: 100 }))
    mockFrom.mockImplementation(() => countChain(100))

    await expect(requireQuotaCapacity('org-1', 'students')).rejects.toBeInstanceOf(
      QuotaExceededError
    )
  })

  it('carries the limit on the thrown error, for the upgrade card', async () => {
    mockPlan.mockResolvedValue(plan({ students_quota: 50 }))
    mockFrom.mockImplementation(() => countChain(50))

    await expect(requireQuotaCapacity('org-1', 'students')).rejects.toMatchObject({
      kind: 'students',
      limit: 50,
    })
  })

  it('allows the row that exactly fills the quota', async () => {
    mockPlan.mockResolvedValue(plan({ students_quota: 100 }))
    mockFrom.mockImplementation(() => countChain(99))

    await expect(requireQuotaCapacity('org-1', 'students')).resolves.toBeUndefined()
  })

  it('counts a bulk import against the quota as a whole', async () => {
    mockPlan.mockResolvedValue(plan({ students_quota: 100 }))
    mockFrom.mockImplementation(() => countChain(95))

    await expect(requireQuotaCapacity('org-1', 'students', 10)).rejects.toBeInstanceOf(
      QuotaExceededError
    )
    await expect(requireQuotaCapacity('org-1', 'students', 5)).resolves.toBeUndefined()
  })

  it('enforces the monthly lessons quota', async () => {
    mockPlan.mockResolvedValue(plan({ lessons_monthly_quota: 200 }))
    mockFrom.mockImplementation(() => countChain(200))

    await expect(requireQuotaCapacity('org-1', 'lessons_monthly')).rejects.toMatchObject({
      kind: 'lessons_monthly',
      limit: 200,
    })
  })

  it('enforces the teachers quota — the seat-pricing value metric', async () => {
    mockPlan.mockResolvedValue(plan({ teachers_quota: 5 }))
    mockFrom.mockImplementation(() => countChain(5))

    await expect(requireQuotaCapacity('org-1', 'teachers')).rejects.toMatchObject({
      kind: 'teachers',
      limit: 5,
    })
  })

  it('counts teachers against the teachers table, not the lessons branch', async () => {
    // The old binary if/else made "anything that is not students" mean lessons.
    // A third kind fell through it silently and enforced the wrong limit.
    mockPlan.mockResolvedValue(plan({ teachers_quota: 5, lessons_monthly_quota: 1 }))
    mockFrom.mockImplementation(() => countChain(2))

    await expect(requireQuotaCapacity('org-1', 'teachers')).resolves.toBeUndefined()
    expect(mockFrom).toHaveBeenCalledWith('teachers')
  })

  it('treats a null teachers quota as unlimited — Center must never lock out', async () => {
    mockPlan.mockResolvedValue(plan({ teachers_quota: null }))
    mockFrom.mockImplementation(() => countChain(400))

    await expect(requireQuotaCapacity('org-1', 'teachers')).resolves.toBeUndefined()
  })

  it('treats a null quota as unlimited', async () => {
    mockPlan.mockResolvedValue(plan({ students_quota: null }))
    mockFrom.mockImplementation(() => countChain(10_000))

    await expect(requireQuotaCapacity('org-1', 'students')).resolves.toBeUndefined()
  })

  it('leaves a grandfathered org (no subscription) unenforced', async () => {
    mockPlan.mockResolvedValue(null)
    mockFrom.mockImplementation(() => countChain(10_000))

    await expect(requireQuotaCapacity('org-1', 'students')).resolves.toBeUndefined()
    expect(mockFrom).not.toHaveBeenCalled()
  })
})

describe('getOrgQuotaUsage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reports the plan limits rather than always claiming unlimited', async () => {
    mockPlan.mockResolvedValue(
      plan({ students_quota: 100, lessons_monthly_quota: 200, teachers_quota: 5 })
    )
    mockFrom.mockImplementation(() => countChain(7))

    await expect(getOrgQuotaUsage('org-1')).resolves.toEqual({
      studentsUsed: 7,
      studentsLimit: 100,
      lessonsUsed: 7,
      lessonsLimit: 200,
      teachersUsed: 7,
      teachersLimit: 5,
    })
  })

  it('reports unlimited for a grandfathered org', async () => {
    mockPlan.mockResolvedValue(null)
    mockFrom.mockImplementation(() => countChain(3))

    await expect(getOrgQuotaUsage('org-1')).resolves.toMatchObject({
      studentsLimit: null,
      lessonsLimit: null,
      teachersLimit: null,
    })
  })
})
