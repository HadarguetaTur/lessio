import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockFrom = vi.fn()
const mockPolicy = vi.fn()

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({ from: (table: string) => mockFrom(table) }),
}))

vi.mock('@/lib/billing/orgBillingPolicy', () => ({
  getOrgBillingPolicy: (orgId: string) => mockPolicy(orgId),
}))

import { createCancellationEvent } from './cancellationEvents'
import type { CancellationChargeResult } from '@/lib/billing/calculateCancellationCharge'

const CHARGE: CancellationChargeResult = {
  shouldCharge: true,
  amount: 200,
  chargeType: 'late_cancellation',
  reasonCode: 'late',
} as unknown as CancellationChargeResult

function callIt() {
  return createCancellationEvent({
    organizationId: 'org-1',
    lessonId: 'lesson-1',
    studentId: 'student-1',
    lessonStartAt: '2026-05-10T09:00:00.000Z',
    timezone: 'Asia/Jerusalem',
    charge: CHARGE,
    cancelledAt: new Date('2026-05-10T06:00:00.000Z'),
  })
}

describe('createCancellationEvent — write errors must propagate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPolicy.mockResolvedValue({ billingMode: 'monthly', cycleStartDay: 1 })
  })

  it('throws when the upsert returns a PostgREST error', async () => {
    mockFrom.mockImplementation(() => ({
      upsert: async () => ({
        error: { code: 'XX000', message: 'boom' },
      }),
    }))

    await expect(callIt()).rejects.toThrow(/boom/)
  })

  it('throws a named deploy-order error when the ON CONFLICT index is missing (42P10)', async () => {
    mockFrom.mockImplementation(() => ({
      upsert: async () => ({
        error: {
          code: '42P10',
          message: 'there is no unique or exclusion constraint matching the ON CONFLICT specification',
        },
      }),
    }))

    await expect(callIt()).rejects.toThrow(
      /student_cancellation_events_lesson_student_unique|20260909160000/
    )
  })

  it('resolves when the upsert succeeds', async () => {
    mockFrom.mockImplementation(() => ({
      upsert: async () => ({ error: null }),
    }))

    await expect(callIt()).resolves.toBeUndefined()
  })

  it('writes nothing for a per-lesson org', async () => {
    mockPolicy.mockResolvedValue({ billingMode: 'per_lesson', cycleStartDay: 1 })
    await expect(callIt()).resolves.toBeUndefined()
    expect(mockFrom).not.toHaveBeenCalled()
  })
})
