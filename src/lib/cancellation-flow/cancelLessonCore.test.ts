/**
 * The cancellation rule, exercised at the one place that owns it.
 *
 * Every case here is a way the six former implementations disagreed about
 * money. They are written against `cancelLessonCore` rather than against each
 * entry point on purpose: the point of the change is that there is now one
 * answer to give, and a test per entry point would only re-assert that the
 * entry points call it.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFrom = vi.fn()
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({ from: (t: string) => mockFrom(t) }),
}))

vi.mock('@/lib/organizations/pricing', () => ({ getOrgPricing: vi.fn() }))
vi.mock('@/lib/organizations', () => ({ getOrgTimezone: vi.fn() }))
vi.mock('@/lib/cancellation-policy/service', () => ({
  getCancellationPolicyServiceRole: vi.fn(),
}))
vi.mock('@/lib/billing/orgBillingPolicy', () => ({ getOrgBillingPolicy: vi.fn() }))
vi.mock('@/lib/billing/resolveBillingParent', async () => {
  const actual = await vi.importActual<typeof import('@/lib/billing/resolveBillingParent')>(
    '@/lib/billing/resolveBillingParent'
  )
  return { ...actual, resolveBillingParent: vi.fn() }
})
vi.mock('@/lib/billing/createCharge', () => ({ createCancellationCharge: vi.fn() }))
vi.mock('@/lib/billing/monthly/cancellationEvents', () => ({ createCancellationEvent: vi.fn() }))

import { cancelLessonCore } from './cancelLessonCore'
import { getOrgPricing } from '@/lib/organizations/pricing'
import { getOrgTimezone } from '@/lib/organizations'
import { getCancellationPolicyServiceRole } from '@/lib/cancellation-policy/service'
import { getOrgBillingPolicy } from '@/lib/billing/orgBillingPolicy'
import { resolveBillingParent } from '@/lib/billing/resolveBillingParent'
import { createCancellationCharge } from '@/lib/billing/createCharge'
import { createCancellationEvent } from '@/lib/billing/monthly/cancellationEvents'

const mockPricing = vi.mocked(getOrgPricing)
const mockTimezone = vi.mocked(getOrgTimezone)
const mockPolicy = vi.mocked(getCancellationPolicyServiceRole)
const mockBilling = vi.mocked(getOrgBillingPolicy)
const mockBillingParent = vi.mocked(resolveBillingParent)
const mockCharge = vi.mocked(createCancellationCharge)
const mockEvent = vi.mocked(createCancellationEvent)

const NOW = new Date('2026-06-10T09:00:00.000Z')
const hoursFromNow = (h: number) => new Date(NOW.getTime() + h * 3_600_000).toISOString()

/** 24h full / 2h partial / 50% — the shipped defaults. */
const POLICY = {
  id: 'policy-1',
  notice_hours_full: 24,
  notice_hours_partial: 2,
  partial_charge_percent: 50,
}

const PRICING = {
  individualHourlyRate: null,
  pairPricePerStudent: 100,
  groupPricePerStudent: 100,
  subscriptionCoveredLessonTypes: [] as string[],
}

interface LessonOpts {
  status?: string
  hoursAhead?: number
  lessonType?: string
  pricePerStudent?: number | null
  students?: Array<{ id: string; name: string }>
  teacherId?: string
}

function lessonRow(opts: LessonOpts = {}) {
  const students = opts.students ?? [{ id: 'student-1', name: 'דנה' }]
  const hoursAhead = opts.hoursAhead ?? 48
  return {
    id: 'lesson-1',
    start_at: hoursFromNow(hoursAhead),
    end_at: hoursFromNow(hoursAhead + 1),
    status: opts.status ?? 'scheduled',
    lesson_type: opts.lessonType ?? 'individual',
    price_per_student: opts.pricePerStudent ?? null,
    lesson_students: students.map((s) => ({
      student_id: s.id,
      students: { full_name: s.name, hourly_rate: 200, discount_percent: null },
    })),
    teachers: {
      id: opts.teacherId ?? 'teacher-1',
      hourly_rate: 200,
      profiles: { full_name: 'שרה' },
    },
  }
}

interface WiringOpts extends LessonOpts {
  billingMode?: 'monthly' | 'per_lesson'
  policy?: typeof POLICY | null
  parentOwnsStudent?: boolean
  /** How many rows the claiming UPDATE reports. 0 = another cancel won. */
  claimedRows?: number
}

/** Every insert/update the core performs, in order, for assertions. */
let claims: number

function wire(opts: WiringOpts = {}) {
  const lesson = lessonRow(opts)
  claims = 0

  mockPricing.mockResolvedValue(PRICING as never)
  mockTimezone.mockResolvedValue('Asia/Jerusalem')
  mockPolicy.mockResolvedValue(opts.policy === undefined ? POLICY : opts.policy)
  mockBilling.mockResolvedValue({
    billingMode: opts.billingMode ?? 'per_lesson',
    cycleStartDay: 1,
    dueDays: 7,
  })
  // Each student is billed to their own primary parent.
  mockBillingParent.mockImplementation(async (studentId: string) =>
    studentId === 'student-2' ? 'parent-2' : 'parent-1'
  )
  mockCharge.mockResolvedValue(null)
  mockEvent.mockResolvedValue(undefined)

  mockFrom.mockImplementation((table: string) => {
    if (table === 'lessons') {
      const self: Record<string, unknown> = {}
      self.select = () => self
      self.eq = () => self
      self.single = () => Promise.resolve({ data: lesson, error: null })
      self.update = () => {
        const upd: Record<string, unknown> = {}
        upd.eq = () => upd
        upd.select = () => {
          const rows = opts.claimedRows ?? 1
          claims += 1
          return Promise.resolve({
            data: Array.from({ length: rows }, () => ({ id: 'lesson-1' })),
            error: null,
          })
        }
        return upd
      }
      return self
    }
    if (table === 'relationships') {
      const self: Record<string, unknown> = {}
      ;['select', 'eq', 'in', 'limit'].forEach((m) => {
        self[m] = () => self
      })
      self.maybeSingle = () =>
        Promise.resolve({
          data: opts.parentOwnsStudent === false ? null : { student_id: 'student-1' },
          error: null,
        })
      return self
    }
    throw new Error(`unexpected table ${table}`)
  })

  return lesson
}

const STAFF = { kind: 'staff' } as const

beforeEach(() => {
  vi.clearAllMocks()
})

describe('1. a delivered lesson is not cancellable (LIFE-01)', () => {
  it('refuses to cancel a completed lesson rather than charging it twice', async () => {
    wire({ status: 'completed', hoursAhead: -48 })

    const outcome = await cancelLessonCore({
      lessonId: 'lesson-1',
      orgId: 'org-1',
      actor: STAFF,
      source: 'dashboard',
      now: NOW,
    })

    expect(outcome).toEqual({ success: false, error: 'already_delivered' })
    // The lesson charge raised when it was completed still stands, and no
    // second full-price cancellation charge was added on top of it.
    expect(mockCharge).not.toHaveBeenCalled()
    expect(claims).toBe(0)
  })

  it('refuses in monthly mode too, where cancelling would erase the bill', async () => {
    wire({ status: 'completed', hoursAhead: -48, billingMode: 'monthly' })

    const outcome = await cancelLessonCore({
      lessonId: 'lesson-1',
      orgId: 'org-1',
      actor: STAFF,
      source: 'dashboard',
      now: NOW,
    })

    // Flipping it to 'cancelled' would drop it out of BILLABLE_STATUSES and the
    // family would pay nothing for a lesson they had.
    expect(outcome).toEqual({ success: false, error: 'already_delivered' })
    expect(mockEvent).not.toHaveBeenCalled()
  })

  it('refuses a no-show for the same reason', async () => {
    wire({ status: 'no_show', hoursAhead: -48 })
    const outcome = await cancelLessonCore({
      lessonId: 'lesson-1',
      orgId: 'org-1',
      actor: STAFF,
      source: 'dashboard',
      now: NOW,
    })
    expect(outcome).toEqual({ success: false, error: 'already_delivered' })
  })
})

describe('2. a teacher cancelling carries the policy fee (LIFE-02)', () => {
  it('charges a teacher cancellation 2h out at the full rate', async () => {
    // 1.5h out is inside notice_hours_partial, so the policy says full price.
    wire({ hoursAhead: 1.5, teacherId: 'teacher-7' })

    const outcome = await cancelLessonCore({
      lessonId: 'lesson-1',
      orgId: 'org-1',
      actor: { kind: 'teacher', teacherId: 'teacher-7' },
      source: 'teacher',
      now: NOW,
    })

    expect(outcome.success).toBe(true)
    if (!outcome.success) return
    // Not zero: the old path read the policy through RLS, got null because
    // teachers have no SELECT policy, and silently waived every fee.
    expect(outcome.billedTotal).toBe(200)
    expect(outcome.lines[0].chargeType).toBe('full')
  })

  it('refuses a teacher cancelling a lesson that is not hers', async () => {
    wire({ teacherId: 'teacher-1' })
    const outcome = await cancelLessonCore({
      lessonId: 'lesson-1',
      orgId: 'org-1',
      actor: { kind: 'teacher', teacherId: 'teacher-9' },
      source: 'teacher',
      now: NOW,
    })
    expect(outcome).toEqual({ success: false, error: 'forbidden' })
  })

  it('cannot waive — waiving is an owner/admin decision', async () => {
    wire({ hoursAhead: 1.5, teacherId: 'teacher-7' })
    const outcome = await cancelLessonCore({
      lessonId: 'lesson-1',
      orgId: 'org-1',
      actor: { kind: 'teacher', teacherId: 'teacher-7' },
      source: 'teacher',
      waive: true,
      now: NOW,
    })
    expect(outcome.success && outcome.billedTotal).toBe(200)
  })
})

describe('3. a portal cancellation in a monthly org is recorded (LIFE-03 / BILL-02)', () => {
  it('writes a cancellation event carrying the policy amount', async () => {
    wire({ hoursAhead: 1.5, billingMode: 'monthly' })

    const outcome = await cancelLessonCore({
      lessonId: 'lesson-1',
      orgId: 'org-1',
      actor: { kind: 'parent', parentId: 'parent-1' },
      source: 'portal',
      now: NOW,
    })

    expect(outcome.success).toBe(true)
    if (!outcome.success) return
    // The old path wrote nothing at all: the lesson simply stopped being
    // billable and fell off the monthly bill.
    expect(mockEvent).toHaveBeenCalledTimes(1)
    expect(mockEvent.mock.calls[0][0]).toMatchObject({
      studentId: 'student-1',
      charge: expect.objectContaining({ amount: 200, chargeType: 'full' }),
    })
    expect(outcome.pendingTotal).toBe(200)
  })
})

describe('4. what the family is told equals what was billed (BILL-02)', () => {
  it('quotes nothing in a monthly org, where nothing was charged', async () => {
    wire({ hoursAhead: 1.5, billingMode: 'monthly' })

    const outcome = await cancelLessonCore({
      lessonId: 'lesson-1',
      orgId: 'org-1',
      actor: { kind: 'parent', parentId: 'parent-1' },
      source: 'whatsapp',
      now: NOW,
    })

    expect(outcome.success).toBe(true)
    if (!outcome.success) return
    // The WhatsApp confirmation renders chargeResult. It used to render a
    // policy figure of 200 for a charge that was never written.
    expect(outcome.chargeResult.amount).toBe(0)
    expect(outcome.chargeResult.shouldCharge).toBe(false)
    expect(outcome.chargeResult.reasonCode).toBe('monthly_pending')
    expect(outcome.billedTotal).toBe(0)
  })

  it('quotes exactly the charged amount in a per-lesson org', async () => {
    wire({ hoursAhead: 1.5 })
    const outcome = await cancelLessonCore({
      lessonId: 'lesson-1',
      orgId: 'org-1',
      actor: { kind: 'parent', parentId: 'parent-1' },
      source: 'whatsapp',
      now: NOW,
    })
    expect(outcome.success).toBe(true)
    if (!outcome.success) return
    expect(outcome.chargeResult.amount).toBe(outcome.billedTotal)
    expect(mockCharge.mock.calls[0][3].amount).toBe(outcome.chargeResult.amount)
  })
})

describe('5. a 50% policy means 50% in BOTH billing modes (BILL-04)', () => {
  // 20h out: inside notice_hours_full (24), outside notice_hours_partial (2).
  it('per-lesson mode charges half', async () => {
    wire({ hoursAhead: 20 })
    const outcome = await cancelLessonCore({
      lessonId: 'lesson-1',
      orgId: 'org-1',
      actor: STAFF,
      source: 'dashboard',
      now: NOW,
    })
    expect(outcome.success && outcome.billedTotal).toBe(100)
    expect(outcome.success && outcome.lines[0].chargeType).toBe('partial')
  })

  it('monthly mode records half, not the full lesson price', async () => {
    wire({ hoursAhead: 20, billingMode: 'monthly' })
    const outcome = await cancelLessonCore({
      lessonId: 'lesson-1',
      orgId: 'org-1',
      actor: STAFF,
      source: 'dashboard',
      now: NOW,
    })

    // The monthly engine hardcoded "under 24 hours → full price" and never read
    // partial_charge_percent, so this used to be 200.
    expect(mockEvent.mock.calls[0][0].charge.amount).toBe(100)
    expect(outcome.success && outcome.pendingTotal).toBe(100)
  })
})

describe('6. the fee lands on the primary parent (LIFE-05)', () => {
  it('bills the primary parent when a secondary parent cancels', async () => {
    wire({ hoursAhead: 1.5 })
    mockBillingParent.mockResolvedValue('parent-primary')

    await cancelLessonCore({
      lessonId: 'lesson-1',
      orgId: 'org-1',
      // The parent who tapped cancel is not the billing parent.
      actor: { kind: 'parent', parentId: 'parent-secondary' },
      source: 'portal',
      now: NOW,
    })

    expect(mockCharge).toHaveBeenCalledTimes(1)
    expect(mockCharge.mock.calls[0][2]).toBe('parent-primary')
  })
})

describe('7. the status dropdown and the cancel panel agree (BILL-03)', () => {
  it('produces the same billing outcome for the same lesson', async () => {
    wire({ hoursAhead: 1.5 })
    const viaPanel = await cancelLessonCore({
      lessonId: 'lesson-1',
      orgId: 'org-1',
      actor: STAFF,
      source: 'dashboard',
      reason: 'panel',
      now: NOW,
    })

    vi.clearAllMocks()
    wire({ hoursAhead: 1.5 })
    const viaDropdown = await cancelLessonCore({
      lessonId: 'lesson-1',
      orgId: 'org-1',
      actor: STAFF,
      source: 'dashboard',
      now: NOW,
    })

    expect(viaPanel.success && viaPanel.billedTotal).toBe(200)
    expect(viaDropdown.success && viaDropdown.billedTotal).toBe(200)
    expect(viaPanel.success && viaPanel.lines.map((l) => l.amount)).toEqual(
      viaDropdown.success ? viaDropdown.lines.map((l) => l.amount) : null
    )
  })
})

describe('8. a group cancellation covers the same families in both modes (BILL-05)', () => {
  const GROUP = {
    hoursAhead: 1.5,
    lessonType: 'group',
    pricePerStudent: 80,
    students: [
      { id: 'student-1', name: 'דנה' },
      { id: 'student-2', name: 'יובל' },
    ],
  }

  it('per-lesson mode charges every enrolled family, not just the first', async () => {
    wire(GROUP)
    const outcome = await cancelLessonCore({
      lessonId: 'lesson-1',
      orgId: 'org-1',
      actor: STAFF,
      source: 'dashboard',
      now: NOW,
    })

    expect(mockCharge).toHaveBeenCalledTimes(2)
    expect(mockCharge.mock.calls.map((c) => c[2])).toEqual(['parent-1', 'parent-2'])
    expect(outcome.success && outcome.lines).toHaveLength(2)
  })

  it('monthly mode covers exactly the same students', async () => {
    wire({ ...GROUP, billingMode: 'monthly' })
    await cancelLessonCore({
      lessonId: 'lesson-1',
      orgId: 'org-1',
      actor: STAFF,
      source: 'dashboard',
      now: NOW,
    })

    expect(mockEvent.mock.calls.map((c) => c[0].studentId)).toEqual(['student-1', 'student-2'])
  })
})

describe('9. two concurrent cancels leave one financial event (LIFE-09)', () => {
  it('records nothing for the cancel that lost the claim', async () => {
    // The claiming UPDATE is guarded on status='scheduled'. The loser matches
    // no rows even though its earlier read saw a scheduled lesson.
    wire({ hoursAhead: 1.5, claimedRows: 0 })

    const outcome = await cancelLessonCore({
      lessonId: 'lesson-1',
      orgId: 'org-1',
      actor: STAFF,
      source: 'dashboard',
      now: NOW,
    })

    expect(outcome).toEqual({ success: false, error: 'already_cancelled' })
    expect(mockCharge).not.toHaveBeenCalled()
    expect(mockEvent).not.toHaveBeenCalled()
  })

  it('records once for the cancel that won it', async () => {
    wire({ hoursAhead: 1.5, claimedRows: 1 })
    const outcome = await cancelLessonCore({
      lessonId: 'lesson-1',
      orgId: 'org-1',
      actor: STAFF,
      source: 'dashboard',
      now: NOW,
    })
    expect(outcome.success).toBe(true)
    expect(mockCharge).toHaveBeenCalledTimes(1)
  })
})

describe('10. two siblings sharing one parent (MONEY-01)', () => {
  it('raises a charge for each child, both to the shared parent', async () => {
    wire({
      hoursAhead: 1.5,
      lessonType: 'group',
      pricePerStudent: 80,
      students: [
        { id: 'student-1', name: 'דנה' },
        { id: 'student-2', name: 'יובל' },
      ],
    })
    // One family, two enrolled children.
    mockBillingParent.mockResolvedValue('parent-shared')

    const outcome = await cancelLessonCore({
      lessonId: 'lesson-1',
      orgId: 'org-1',
      actor: STAFF,
      source: 'dashboard',
      now: NOW,
    })

    // Both rows are written. Under the old (lesson_id, parent_id) index the
    // second raised 23505 and was swallowed as a duplicate; the fix keys
    // idempotency on the student, so the writer must pass it.
    expect(mockCharge).toHaveBeenCalledTimes(2)
    expect(mockCharge.mock.calls.map((c) => c[4])).toEqual(['student-1', 'student-2'])
    expect(mockCharge.mock.calls.map((c) => c[2])).toEqual(['parent-shared', 'parent-shared'])
    expect(outcome.success && outcome.billedTotal).toBe(160)
  })
})

describe('waiving and the outside-window case', () => {
  it('an owner waiving charges nothing but still records the cancellation', async () => {
    wire({ hoursAhead: 1.5, billingMode: 'monthly' })
    const outcome = await cancelLessonCore({
      lessonId: 'lesson-1',
      orgId: 'org-1',
      actor: STAFF,
      source: 'dashboard',
      waive: true,
      now: NOW,
    })
    expect(outcome.success && outcome.billedTotal).toBe(0)
    expect(outcome.success && outcome.pendingTotal).toBe(0)
    // Still recorded: the monthly engine needs to know the lesson was cancelled.
    expect(mockEvent).toHaveBeenCalledTimes(1)
    expect(mockEvent.mock.calls[0][0].charge.amount).toBe(0)
  })

  it('charges nothing well outside the notice window', async () => {
    wire({ hoursAhead: 72 })
    const outcome = await cancelLessonCore({
      lessonId: 'lesson-1',
      orgId: 'org-1',
      actor: STAFF,
      source: 'dashboard',
      now: NOW,
    })
    expect(outcome.success && outcome.billedTotal).toBe(0)
    expect(mockCharge).not.toHaveBeenCalled()
  })

  it('refuses a parent cancelling a lesson that is not theirs', async () => {
    wire({ parentOwnsStudent: false })
    const outcome = await cancelLessonCore({
      lessonId: 'lesson-1',
      orgId: 'org-1',
      actor: { kind: 'parent', parentId: 'stranger' },
      source: 'portal',
      now: NOW,
    })
    expect(outcome).toEqual({ success: false, error: 'forbidden' })
  })
})
