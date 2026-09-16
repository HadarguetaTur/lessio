import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeDb, type FakeDb } from '@/test-utils/fakeSupabase'
import { DEFAULT_COLLECTION_POLICY, type CollectionPolicy } from '@/lib/cancellation-policy/collection'

let fake: FakeDb

vi.mock('@/lib/supabase/service-role', () => ({ createServiceRoleClient: () => fake.client }))
vi.mock('@/lib/charges/audit', () => ({ logChargeAudit: vi.fn() }))
vi.mock('@/lib/charges/resolve', () => ({ voidCharge: vi.fn() }))
vi.mock('@/lib/billing/resolveBillingParent', async () => {
  const actual = await vi.importActual<typeof import('@/lib/billing/resolveBillingParent')>('@/lib/billing/resolveBillingParent')
  return { ...actual, resolveBillingParent: vi.fn().mockResolvedValue('parent-1') }
})
vi.mock('@/lib/organizations/pricing', () => ({ getOrgPricing: vi.fn() }))
vi.mock('@/lib/organizations', () => ({ getOrgTimezone: vi.fn().mockResolvedValue('Asia/Jerusalem') }))
vi.mock('@/lib/billing/orgBillingPolicy', () => ({ getOrgBillingPolicy: vi.fn() }))
vi.mock('@/lib/cancellation-policy/service', () => ({ getCollectionPolicyServiceRole: vi.fn() }))
vi.mock('@/lib/billing/packs/notify', () => ({ notifyPackBalances: vi.fn() }))
vi.mock('@/lib/billing/packs/ledger', () => ({
  consumePackCredit: vi.fn(),
  loadLessonPackUses: vi.fn(),
  reverseLedgerEntries: vi.fn(),
}))

import { settleLessonOutcome } from './settleLessonOutcome'
import { voidCharge } from '@/lib/charges/resolve'
import { getOrgPricing } from '@/lib/organizations/pricing'
import { getOrgBillingPolicy } from '@/lib/billing/orgBillingPolicy'
import { getCollectionPolicyServiceRole } from '@/lib/cancellation-policy/service'
import { consumePackCredit, loadLessonPackUses, reverseLedgerEntries } from '@/lib/billing/packs/ledger'

const mockVoid = vi.mocked(voidCharge)
const mockConsume = vi.mocked(consumePackCredit)
const mockUses = vi.mocked(loadLessonPackUses)
const mockReverse = vi.mocked(reverseLedgerEntries)

const PRICING = {
  individualHourlyRate: 200,
  pairPricePerStudent: 200,
  groupPricePerStudent: 150,
  subscriptionCoveredLessonTypes: ['group'],
}

function lesson(opts: {
  status?: string
  type?: string
  students?: Array<{ id: string; attendance?: string | null }>
}) {
  return {
    id: 'lesson-1',
    organization_id: 'org-1',
    status: opts.status ?? 'completed',
    start_at: '2026-09-10T10:00:00Z',
    end_at: '2026-09-10T11:00:00Z',
    lesson_type: opts.type ?? 'pair',
    price_per_student: null,
    teachers: { id: 't1', hourly_rate: 200 },
    lesson_students: (opts.students ?? [{ id: 's1' }, { id: 's2' }]).map((s) => ({
      lesson_id: 'lesson-1',
      student_id: s.id,
      attendance: s.attendance ?? null,
      absence_amount: null,
      absence_covered_by: null,
      students: { hourly_rate: null, discount_percent: null },
    })),
  }
}

function setup(opts: {
  lessonRow: ReturnType<typeof lesson>
  charges?: Array<Record<string, unknown>>
  subscriptions?: Array<Record<string, unknown>>
  mode?: 'per_lesson' | 'monthly'
  policy?: Partial<CollectionPolicy>
  packFor?: string[]
}) {
  fake = createFakeDb({
    lessons: [opts.lessonRow],
    // The update path writes lesson_students through its own table.
    lesson_students: opts.lessonRow.lesson_students as unknown as Record<string, unknown>[],
    charges: (opts.charges ?? []).map((c) => ({ organization_id: 'org-1', lesson_id: 'lesson-1', ...c })),
    subscriptions: opts.subscriptions ?? [],
  })
  vi.mocked(getOrgPricing).mockResolvedValue(PRICING as never)
  vi.mocked(getOrgBillingPolicy).mockResolvedValue({ billingMode: opts.mode ?? 'per_lesson', cycleStartDay: 1, dueDays: 7 })
  vi.mocked(getCollectionPolicyServiceRole).mockResolvedValue({ ...DEFAULT_COLLECTION_POLICY, noShowChargePercent: 50, ...opts.policy })
  mockConsume.mockImplementation(async ({ studentId, kind }) =>
    (opts.packFor ?? []).includes(studentId)
      ? { outcome: 'consumed', packId: `pack-${studentId}`, remaining: 3, kind }
      : { outcome: 'none', packId: null, remaining: 0, kind: null }
  )
}

const inserted = () => fake.writes.filter(([t, op]) => t === 'charges' && op === 'insert').map(([, , row]) => row)
const absenceOf = (studentId: string) =>
  fake.tables.lesson_students.find((r) => r.student_id === studentId) as { absence_amount: number | null; absence_covered_by: string | null }

describe('settleLessonOutcome', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUses.mockResolvedValue([])
    mockReverse.mockResolvedValue()
    mockVoid.mockResolvedValue({ ok: true, parentId: 'parent-1', previousStatus: 'pending' })
  })

  it('punches a present student with a pack and bills an absent one the no-show percentage', async () => {
    setup({
      lessonRow: lesson({ students: [{ id: 's1', attendance: 'present' }, { id: 's2', attendance: 'absent' }] }),
      packFor: ['s1'],
    })
    const onPackConsumed = vi.fn()

    await expect(settleLessonOutcome('lesson-1', 'org-1', { onPackConsumed })).resolves.toBeNull()

    expect(mockConsume).toHaveBeenCalledWith(expect.objectContaining({ studentId: 's1', kind: 'consume_lesson', lessonDate: '2026-09-10' }))
    expect(onPackConsumed).toHaveBeenCalledWith('pack-s1')
    expect(inserted()).toEqual([
      expect.objectContaining({ student_id: 's2', charge_type: 'no_show', amount: 100, status: 'pending' }),
    ])
    expect(absenceOf('s2')).toMatchObject({ absence_amount: 100, absence_covered_by: null })
  })

  it('burns a no-show punch when the policy says consume', async () => {
    setup({ lessonRow: lesson({ status: 'no_show', students: [{ id: 's1' }] }), packFor: ['s1'] })
    await settleLessonOutcome('lesson-1', 'org-1')
    expect(mockConsume).toHaveBeenCalledWith(expect.objectContaining({ kind: 'consume_no_show' }))
    expect(inserted()).toEqual([])
    expect(absenceOf('s1')).toMatchObject({ absence_amount: 0, absence_covered_by: 'pack' })
  })

  it('charges instead of punching an absence when the policy says charge', async () => {
    setup({
      lessonRow: lesson({ status: 'no_show', students: [{ id: 's1' }] }),
      packFor: ['s1'],
      policy: { noShowPackAction: 'charge' },
    })
    await settleLessonOutcome('lesson-1', 'org-1')
    expect(mockConsume).not.toHaveBeenCalled()
    expect(inserted()).toEqual([expect.objectContaining({ charge_type: 'no_show', amount: 100 })])
  })

  it('is idempotent: an existing lesson charge stays and no pack is punched retroactively', async () => {
    setup({
      lessonRow: lesson({ students: [{ id: 's1' }] }),
      charges: [{ id: 'c1', student_id: 's1', parent_id: 'parent-1', charge_type: 'lesson', status: 'pending', amount: 200 }],
      packFor: ['s1'],
    })
    await settleLessonOutcome('lesson-1', 'org-1')
    expect(mockConsume).not.toHaveBeenCalled()
    expect(mockVoid).not.toHaveBeenCalled()
    expect(inserted()).toEqual([])
  })

  it('present → absent voids the pending lesson charge and raises the no-show fee', async () => {
    setup({
      lessonRow: lesson({ students: [{ id: 's1', attendance: 'absent' }] }),
      charges: [{ id: 'c1', student_id: 's1', parent_id: 'parent-1', charge_type: 'lesson', status: 'pending', amount: 200 }],
    })
    await settleLessonOutcome('lesson-1', 'org-1', { actorProfileId: 'owner-1' })
    expect(mockVoid).toHaveBeenCalledWith('c1', 'org-1', 'owner-1', 'outcome_changed')
    expect(inserted()).toEqual([expect.objectContaining({ charge_type: 'no_show', amount: 100 })])
  })

  it('refuses to touch a paid charge and says so', async () => {
    setup({
      lessonRow: lesson({ students: [{ id: 's1', attendance: 'absent' }] }),
      charges: [{ id: 'c1', student_id: 's1', parent_id: 'parent-1', charge_type: 'lesson', status: 'paid', amount: 200 }],
    })
    const alert = await settleLessonOutcome('lesson-1', 'org-1')
    expect(alert).toEqual({ type: 'outcome_conflict', message: 'validation.outcomeConflictsPaidCharge' })
    expect(mockVoid).not.toHaveBeenCalled()
  })

  it('swaps a lesson punch for a no-show punch when attendance flips', async () => {
    setup({ lessonRow: lesson({ students: [{ id: 's1', attendance: 'absent' }] }), packFor: ['s1'] })
    mockUses.mockResolvedValue([{ id: 'u1', pack_id: 'pack-s1', student_id: 's1', kind: 'consume_lesson' }])
    await settleLessonOutcome('lesson-1', 'org-1')
    expect(mockReverse).toHaveBeenCalledWith('org-1', ['u1'], 'outcome_changed')
    expect(mockConsume).toHaveBeenCalledWith(expect.objectContaining({ kind: 'consume_no_show' }))
  })

  it('reopening a lesson reverses punches and voids pending charges', async () => {
    setup({
      lessonRow: lesson({ status: 'scheduled', students: [{ id: 's1' }, { id: 's2' }] }),
      charges: [{ id: 'c2', student_id: 's2', parent_id: 'parent-1', charge_type: 'lesson', status: 'pending', amount: 200 }],
    })
    mockUses.mockResolvedValue([{ id: 'u1', pack_id: 'p', student_id: 's1', kind: 'consume_lesson' }])
    await settleLessonOutcome('lesson-1', 'org-1')
    expect(mockReverse).toHaveBeenCalledWith('org-1', ['u1'], 'lesson_reopened')
    expect(mockVoid).toHaveBeenCalledWith('c2', 'org-1', null, 'lesson_reopened')
    expect(mockConsume).not.toHaveBeenCalled()
  })

  it('writes no charge in a monthly org but keeps the absence snapshot for the engine', async () => {
    setup({ lessonRow: lesson({ status: 'no_show', students: [{ id: 's1' }] }), mode: 'monthly' })
    await settleLessonOutcome('lesson-1', 'org-1')
    expect(inserted()).toEqual([])
    expect(absenceOf('s1')).toMatchObject({ absence_amount: 100 })
  })

  it('a subscription covers a no-show: nothing punched, nothing billed', async () => {
    setup({
      lessonRow: lesson({ status: 'no_show', type: 'group', students: [{ id: 's1' }] }),
      subscriptions: [{ organization_id: 'org-1', student_id: 's1', start_date: '2026-01-01', end_date: null, is_paused: false }],
      packFor: ['s1'],
    })
    await settleLessonOutcome('lesson-1', 'org-1')
    expect(mockConsume).not.toHaveBeenCalled()
    expect(inserted()).toEqual([])
    expect(absenceOf('s1')).toMatchObject({ absence_amount: 0, absence_covered_by: 'subscription' })
  })

  it('leaves a cancelled lesson to the cancellation core', async () => {
    setup({ lessonRow: lesson({ status: 'cancelled' }) })
    await expect(settleLessonOutcome('lesson-1', 'org-1')).resolves.toBeNull()
    expect(mockUses).not.toHaveBeenCalled()
  })
})
