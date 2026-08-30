import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFrom = vi.fn()

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({ from: (t: string) => mockFrom(t) }),
}))
vi.mock('@/lib/crypto', () => ({ decryptToken: () => 'decrypted' }))
vi.mock('@/lib/jwt', () => ({ signBookingToken: vi.fn(() => Promise.resolve('tok')) }))

const { mockSendSmart } = vi.hoisted(() => ({
  mockSendSmart: vi.fn((params: unknown) => {
    void params
    return Promise.resolve({ sent: true })
  }),
}))
vi.mock('@/lib/whatsapp/sendSmart', () => ({
  sendSmartMessage: mockSendSmart,
}))

import { examWeekStart, upsertQuotaOverride, applyExamPolicy } from './policy'
import type { StudentExam } from '@/lib/students/exams'

const TZ = 'Asia/Jerusalem'

function chain(result: unknown) {
  const self: Record<string, unknown> = {}
  const pass = () => self
  ;['select', 'eq', 'insert', 'update'].forEach((m) => {
    self[m] = pass
  })
  self['maybeSingle'] = () => Promise.resolve(result)
  self['single'] = () => Promise.resolve(result)
  self['then'] = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res)
  return self
}

const EXAM: StudentExam = {
  id: 'exam-1',
  organizationId: 'org-1',
  studentId: 'student-1',
  subject: 'מתמטיקה',
  title: 'משוואות',
  examDate: '2026-09-15', // Tuesday — week of Sunday 2026-09-13
  score: null,
  maxScore: 100,
  notes: null,
  source: 'student',
  status: 'reported',
  description: null,
  storagePath: null,
  fileName: null,
  mimeType: null,
  reportedByParentId: null,
  createdBy: null,
  createdAt: 'now',
  updatedAt: 'now',
}

describe('examWeekStart', () => {
  it('returns the org-local Sunday of the exam week', () => {
    expect(examWeekStart('2026-09-15', TZ)).toBe('2026-09-13')
    expect(examWeekStart('2026-09-13', TZ)).toBe('2026-09-13') // Sunday stays put
    expect(examWeekStart('2026-09-19', TZ)).toBe('2026-09-13') // Saturday closes the week
  })
})

describe('upsertQuotaOverride', () => {
  beforeEach(() => vi.clearAllMocks())

  const params = {
    orgId: 'org-1',
    studentId: 'student-1',
    weekStart: '2026-09-13',
    extraLessons: 2,
    examId: 'exam-1',
  }

  it('inserts when no override exists for the week', async () => {
    let inserted: Record<string, unknown> | null = null
    mockFrom.mockImplementation(() => {
      const self = chain({ data: null, error: null }) as Record<string, unknown>
      self['insert'] = (row: Record<string, unknown>) => {
        inserted = row
        return chain({ data: null, error: null })
      }
      return self
    })

    await upsertQuotaOverride(params)

    expect(inserted).toMatchObject({ student_id: 'student-1', week_start: '2026-09-13', extra_lessons: 2 })
  })

  it('never lowers or stacks an existing override', async () => {
    const updates: unknown[] = []
    mockFrom.mockImplementation(() => {
      const self = chain({ data: { id: 'ovr-1', extra_lessons: 3 }, error: null }) as Record<string, unknown>
      self['update'] = (row: unknown) => {
        updates.push(row)
        return self
      }
      return self
    })

    await upsertQuotaOverride(params) // existing 3 >= requested 2

    expect(updates).toHaveLength(0)
  })

  it('raises an existing smaller override', async () => {
    const updates: Record<string, unknown>[] = []
    mockFrom.mockImplementation(() => {
      const self = chain({ data: { id: 'ovr-1', extra_lessons: 1 }, error: null }) as Record<string, unknown>
      self['update'] = (row: Record<string, unknown>) => {
        updates.push(row)
        return self
      }
      return self
    })

    await upsertQuotaOverride(params)

    expect(updates).toEqual([{ extra_lessons: 2 }])
  })
})

describe('applyExamPolicy', () => {
  beforeEach(() => vi.clearAllMocks())

  function mockOrg(opts: {
    mode: string
    bump?: number
    booster?: boolean
    enforce?: boolean
  }) {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'organizations') {
        return chain({
          data: {
            exam_policy_mode: opts.mode,
            exam_quota_bump: opts.bump ?? 1,
            exam_offer_booster: opts.booster ?? false,
            timezone: TZ,
            enforce_weekly_quota: opts.enforce ?? true,
            whatsapp_access_token: opts.booster ? 'enc' : null,
            whatsapp_phone_number_id: opts.booster ? 'pnid' : null,
          },
          error: null,
        })
      }
      if (table === 'relationships') {
        return chain({
          data: [
            {
              parent_id: 'parent-1',
              is_primary: true,
              parents: { phone: '+972500000001', preferred_locale: 'he' },
            },
          ],
          error: null,
        })
      }
      // student_quota_overrides — nothing exists yet
      return chain({ data: null, error: null })
    })
  }

  it('does nothing beyond the notification in notify mode', async () => {
    mockOrg({ mode: 'notify' })

    await applyExamPolicy({ orgId: 'org-1', exam: EXAM })

    expect(mockFrom).not.toHaveBeenCalledWith('student_quota_overrides')
    expect(mockSendSmart).not.toHaveBeenCalled()
  })

  it('creates the override immediately in auto mode', async () => {
    mockOrg({ mode: 'auto', bump: 2 })

    await applyExamPolicy({ orgId: 'org-1', exam: EXAM })

    expect(mockFrom).toHaveBeenCalledWith('student_quota_overrides')
  })

  it('skips the bump when the org does not enforce the weekly quota', async () => {
    mockOrg({ mode: 'auto', enforce: false })

    await applyExamPolicy({ orgId: 'org-1', exam: EXAM })

    expect(mockFrom).not.toHaveBeenCalledWith('student_quota_overrides')
  })

  it('offers the billing parent a booking link when the booster toggle is on', async () => {
    mockOrg({ mode: 'notify', booster: true })

    await applyExamPolicy({ orgId: 'org-1', exam: EXAM })

    expect(mockSendSmart).toHaveBeenCalledTimes(1)
    const call = mockSendSmart.mock.calls[0][0] as unknown as {
      templateType: string
      phone: string
      vars: Record<string, string>
    }
    expect(call.templateType).toBe('booking_link')
    expect(call.phone).toBe('+972500000001')
    expect(call.vars.booking_url).toContain('/book/')
  })
})
