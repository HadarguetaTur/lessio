import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeDb, type FakeDb } from '@/test-utils/fakeSupabase'

let fake: FakeDb

vi.mock('@/lib/supabase/service-role', () => ({ createServiceRoleClient: () => fake.client }))
vi.mock('@/lib/billing/orgBillingPolicy', () => ({ getOrgBillingPolicy: vi.fn() }))
vi.mock('@/lib/organizations/pricing', () => ({
  getOrgPricing: vi.fn().mockResolvedValue({
    individualHourlyRate: null,
    pairPricePerStudent: 100,
    groupPricePerStudent: 80,
    subscriptionCoveredLessonTypes: ['group'],
  }),
}))
vi.mock('@/lib/organizations', () => ({ getOrgTimezone: vi.fn().mockResolvedValue('Asia/Jerusalem') }))
vi.mock('@/lib/billing/resolveBillingParent', async () => {
  const actual = await vi.importActual<typeof import('@/lib/billing/resolveBillingParent')>('@/lib/billing/resolveBillingParent')
  return { ...actual, resolveBillingParent: vi.fn().mockResolvedValue('parent-1') }
})
vi.mock('@/lib/charges/audit', () => ({ logChargeAudit: vi.fn() }))
vi.mock('@/lib/charges/resolve', () => ({ voidCharge: vi.fn() }))
vi.mock('@/lib/payments/factory', () => ({ getPaymentProvider: vi.fn() }))
vi.mock('@/lib/billing/packs/sell', () => ({ sellPack: vi.fn() }))
vi.mock('@/lib/i18n/serverTranslator', () => ({ getT: vi.fn().mockResolvedValue((key: string) => key) }))
vi.mock('@/lib/notifications', () => ({ notifyMultiple: vi.fn(), getOwnerAndAdminProfileIds: vi.fn().mockResolvedValue([]) }))
vi.mock('@/lib/cancellation-policy/service', () => ({ getCollectionPolicyServiceRole: vi.fn() }))
vi.mock('./validateSlotLock', () => ({ validateSlotLock: vi.fn() }))
vi.mock('./confirmBooking', () => ({ confirmBooking: vi.fn() }))

import { confirmCheckoutsForCharges, getBookingOptions } from './checkout'
import { getOrgBillingPolicy } from '@/lib/billing/orgBillingPolicy'
import { sellPack } from '@/lib/billing/packs/sell'
import { confirmBooking } from './confirmBooking'
import { getCollectionPolicyServiceRole } from '@/lib/cancellation-policy/service'
import { DEFAULT_COLLECTION_POLICY } from '@/lib/cancellation-policy/collection'

const LOCK = {
  teacher_id: 'teacher-1',
  student_id: 'student-1',
  start_at: '2026-10-01T10:00:00Z',
  end_at: '2026-10-01T11:00:00Z',
}

function seed(extra: Record<string, Array<Record<string, unknown>>> = {}) {
  fake = createFakeDb({
    organizations: [{ id: 'org-1', payment_provider: 'payplus' }],
    lesson_pack_products: [
      { id: 'prod-1', organization_id: 'org-1', name: '10 lessons', credits: 10, price: 1800, validity_days: 90, covered_lesson_types: ['individual'], is_active: true, sort_order: 0 },
    ],
    teachers: [{ id: 'teacher-1', organization_id: 'org-1', hourly_rate: 200 }],
    students: [{ id: 'student-1', organization_id: 'org-1', hourly_rate: null, discount_percent: null }],
    subscriptions: [],
    lesson_pack_balances: [],
    lesson_students: [],
    ...extra,
  })
}

describe('getBookingOptions — who has to pay before booking', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getOrgBillingPolicy).mockResolvedValue({ billingMode: 'per_lesson', cycleStartDay: 1, dueDays: 7 })
    vi.mocked(getCollectionPolicyServiceRole).mockResolvedValue({ ...DEFAULT_COLLECTION_POLICY, packCollectionEnabled: true })
  })

  it('never gates an org that did not choose to collect through punch cards', async () => {
    seed()
    vi.mocked(getCollectionPolicyServiceRole).mockResolvedValue(DEFAULT_COLLECTION_POLICY)
    await expect(getBookingOptions({ organizationId: 'org-1', studentId: 'student-1', lock: LOCK })).resolves.toMatchObject({ required: false })
  })

  it('never gates a monthly org', async () => {
    seed()
    vi.mocked(getOrgBillingPolicy).mockResolvedValue({ billingMode: 'monthly', cycleStartDay: 1, dueDays: 7 })
    await expect(getBookingOptions({ organizationId: 'org-1', studentId: 'student-1', lock: LOCK })).resolves.toMatchObject({ required: false })
  })

  it('never gates an org without a payment provider or without a catalog', async () => {
    seed({ organizations: [{ id: 'org-1', payment_provider: null }] })
    expect((await getBookingOptions({ organizationId: 'org-1', studentId: 'student-1', lock: LOCK })).required).toBe(false)
    seed({ lesson_pack_products: [] })
    expect((await getBookingOptions({ organizationId: 'org-1', studentId: 'student-1', lock: LOCK })).required).toBe(false)
  })

  it('asks a parent with no entitlement to choose a pack or a single lesson at its exact price', async () => {
    seed()
    const options = await getBookingOptions({ organizationId: 'org-1', studentId: 'student-1', lock: LOCK })
    expect(options).toMatchObject({ required: true, entitlement: 'none', singleLessonPrice: 200 })
    expect(options.products.map((p) => p.id)).toEqual(['prod-1'])
  })

  it('lets a student with a spare credit book as usual', async () => {
    seed({
      lesson_pack_balances: [
        { organization_id: 'org-1', remaining: 3, valid_from: '2026-09-01', valid_until: null, cancelled_at: null, activated_at: '2026-09-01T00:00:00Z', covered_lesson_types: ['individual'], student_id: 'student-1' },
      ],
    })
    await expect(getBookingOptions({ organizationId: 'org-1', studentId: 'student-1', lock: LOCK })).resolves.toMatchObject({
      required: true,
      entitlement: 'pack',
    })
  })
})

describe('confirmCheckoutsForCharges — only a verified payment confirms', () => {
  const session = {
    id: 'session-1',
    organization_id: 'org-1',
    student_id: 'student-1',
    teacher_id: 'teacher-1',
    slot_lock_id: 'lock-1',
    selection: 'pack',
    pack_product_id: 'prod-1',
    charge_id: 'charge-1',
    status: 'pending',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(sellPack).mockResolvedValue({ ok: true, packId: 'pack-1', chargeId: 'charge-1', activated: true, parentId: 'parent-1' })
  })

  it('issues the paid pack and confirms the lesson while the slot is held', async () => {
    seed({ booking_checkout_sessions: [{ ...session }], charges: [{ id: 'charge-1', organization_id: 'org-1' }] })
    vi.mocked(confirmBooking).mockResolvedValue({ lessonId: 'lesson-1', teacherId: 'teacher-1', studentId: 'student-1', startAt: LOCK.start_at, endAt: LOCK.end_at })

    await confirmCheckoutsForCharges('org-1', ['charge-1'])

    expect(sellPack).toHaveBeenCalledWith(expect.objectContaining({ productId: 'prod-1', existingChargeId: 'charge-1' }))
    expect(fake.tables.booking_checkout_sessions[0]).toMatchObject({ status: 'confirmed', lesson_id: 'lesson-1', pack_id: 'pack-1' })
  })

  it('keeps the paid pack but books nothing when the slot was lost', async () => {
    seed({ booking_checkout_sessions: [{ ...session }] })
    vi.mocked(confirmBooking).mockRejectedValue(new Error('lock expired'))

    await confirmCheckoutsForCharges('org-1', ['charge-1'])

    expect(sellPack).toHaveBeenCalled()
    expect(fake.tables.booking_checkout_sessions[0]).toMatchObject({ status: 'needs_attention', pack_id: 'pack-1' })
  })

  it('links a single lesson charge to the lesson it paid for', async () => {
    seed({
      booking_checkout_sessions: [{ ...session, selection: 'single_lesson', pack_product_id: null }],
      charges: [{ id: 'charge-1', organization_id: 'org-1', lesson_id: null }],
    })
    vi.mocked(confirmBooking).mockResolvedValue({ lessonId: 'lesson-9', teacherId: 'teacher-1', studentId: 'student-1', startAt: LOCK.start_at, endAt: LOCK.end_at })

    await confirmCheckoutsForCharges('org-1', ['charge-1'])

    expect(sellPack).not.toHaveBeenCalled()
    expect(fake.tables.charges[0]).toMatchObject({ lesson_id: 'lesson-9' })
  })

  it('does nothing on a redelivered callback', async () => {
    seed({ booking_checkout_sessions: [{ ...session, status: 'confirmed' }] })
    await confirmCheckoutsForCharges('org-1', ['charge-1'])
    expect(confirmBooking).not.toHaveBeenCalled()
  })
})
