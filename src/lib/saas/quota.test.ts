import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockFrom = vi.fn()

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({ from: (table: string) => mockFrom(table) }),
}))

vi.mock('./subscriptions', () => ({
  getOrgSubscriptionState: vi.fn(),
}))

vi.mock('./plans', () => ({
  getSaasPlanById: vi.fn(),
}))

import { requireQuotaCapacity, getOrgQuotaUsage, QuotaExceededError } from './quota'
import { getOrgSubscriptionState } from './subscriptions'
import { getSaasPlanById } from './plans'

const mockState = vi.mocked(getOrgSubscriptionState)
const mockPlan = vi.mocked(getSaasPlanById)

/** A plan row as getSaasPlanById now returns it — quota columns included. */
function plan(overrides: { students_quota?: number | null; lessons_monthly_quota?: number | null }) {
  return {
    id: 'plan-1',
    name: 'basic' as const,
    display_name_he: 'בסיסי',
    display_name_en: 'Basic',
    price_monthly: 99,
    price_yearly: 990,
    features: {
      whatsapp_automation: false,
      ai_assistant: false,
      full_reports: false,
      leads: false,
      homework: false,
      parent_portal: false,
      integrations: false,
    },
    sort_order: 1,
    students_quota: null,
    lessons_monthly_quota: null,
    ...overrides,
  }
}

function subscribed() {
  mockState.mockResolvedValue({
    subscriptionId: 'sub-1',
    planId: 'plan-1',
    planName: 'basic',
    status: 'active',
    billingInterval: 'monthly',
    trialEndsAt: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    cardLastFour: null,
    features: plan({}).features,
  })
}

/** A count query: .select(...).eq(...)[.gte(...).lt(...)] resolving to { count }. */
function countChain(count: number) {
  const chain: Record<string, unknown> = {}
  chain.eq = () => chain
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
    subscribed()
    mockPlan.mockResolvedValue(plan({ students_quota: 100 }))
    mockFrom.mockImplementation(() => countChain(100))

    await expect(requireQuotaCapacity('org-1', 'students')).rejects.toBeInstanceOf(
      QuotaExceededError
    )
  })

  it('carries the limit on the thrown error, for the upgrade card', async () => {
    subscribed()
    mockPlan.mockResolvedValue(plan({ students_quota: 50 }))
    mockFrom.mockImplementation(() => countChain(50))

    await expect(requireQuotaCapacity('org-1', 'students')).rejects.toMatchObject({
      kind: 'students',
      limit: 50,
    })
  })

  it('allows the row that exactly fills the quota', async () => {
    subscribed()
    mockPlan.mockResolvedValue(plan({ students_quota: 100 }))
    mockFrom.mockImplementation(() => countChain(99))

    await expect(requireQuotaCapacity('org-1', 'students')).resolves.toBeUndefined()
  })

  it('counts a bulk import against the quota as a whole', async () => {
    subscribed()
    mockPlan.mockResolvedValue(plan({ students_quota: 100 }))
    mockFrom.mockImplementation(() => countChain(95))

    await expect(requireQuotaCapacity('org-1', 'students', 10)).rejects.toBeInstanceOf(
      QuotaExceededError
    )
    await expect(requireQuotaCapacity('org-1', 'students', 5)).resolves.toBeUndefined()
  })

  it('enforces the monthly lessons quota', async () => {
    subscribed()
    mockPlan.mockResolvedValue(plan({ lessons_monthly_quota: 200 }))
    mockFrom.mockImplementation(() => countChain(200))

    await expect(requireQuotaCapacity('org-1', 'lessons_monthly')).rejects.toMatchObject({
      kind: 'lessons_monthly',
      limit: 200,
    })
  })

  it('treats a null quota as unlimited', async () => {
    subscribed()
    mockPlan.mockResolvedValue(plan({ students_quota: null }))
    mockFrom.mockImplementation(() => countChain(10_000))

    await expect(requireQuotaCapacity('org-1', 'students')).resolves.toBeUndefined()
  })

  it('leaves a grandfathered org (no subscription) unenforced', async () => {
    mockState.mockResolvedValue(null)
    mockFrom.mockImplementation(() => countChain(10_000))

    await expect(requireQuotaCapacity('org-1', 'students')).resolves.toBeUndefined()
    expect(mockPlan).not.toHaveBeenCalled()
  })
})

describe('getOrgQuotaUsage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reports the plan limits rather than always claiming unlimited', async () => {
    subscribed()
    mockPlan.mockResolvedValue(plan({ students_quota: 100, lessons_monthly_quota: 200 }))
    mockFrom.mockImplementation(() => countChain(7))

    await expect(getOrgQuotaUsage('org-1')).resolves.toEqual({
      studentsUsed: 7,
      studentsLimit: 100,
      lessonsUsed: 7,
      lessonsLimit: 200,
    })
  })
})
