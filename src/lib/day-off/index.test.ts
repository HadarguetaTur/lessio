import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DateTime, Settings } from 'luxon'

// ── Module mocks ──────────────────────────────────────────────────────────────

const mockFrom = vi.fn()

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({ from: (t: string) => mockFrom(t) }),
}))

vi.mock('@/lib/whatsapp', () => ({
  sendTextMessage: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/whatsapp/interactive', () => ({
  sendReplyButtons: vi.fn().mockResolvedValue(undefined),
  sendTemplateWithQuickReplies: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/whatsapp/sendSmart', () => ({
  sendSmartMessage: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/whatsapp/consent', () => ({
  prepareBusinessSend: vi.fn().mockResolvedValue({ ok: true }),
}))

vi.mock('@/lib/whatsapp/templates', () => ({
  resolveTemplate: vi.fn().mockResolvedValue('resolved-body'),
}))

vi.mock('@/lib/notifications', () => ({
  notifyMultiple: vi.fn().mockResolvedValue(undefined),
  getOwnerAndAdminProfileIds: vi.fn().mockResolvedValue(['profile-1']),
  getTeacherProfileId: vi.fn().mockResolvedValue('teacher-profile-1'),
}))

import {
  approveDayOffRequest,
  createDayOffRequest,
  getPendingRequests,
  rejectDayOffRequest,
} from './index'
import { sendTextMessage } from '@/lib/whatsapp'
import { sendTemplateWithQuickReplies } from '@/lib/whatsapp/interactive'
import { prepareBusinessSend } from '@/lib/whatsapp/consent'
import { sendSmartMessage } from '@/lib/whatsapp/sendSmart'
import { notifyMultiple } from '@/lib/notifications'

const mockSendTemplateWithQuickReplies = vi.mocked(sendTemplateWithQuickReplies)
const mockSendTextMessage = vi.mocked(sendTextMessage)
const mockSendSmartMessage = vi.mocked(sendSmartMessage)
const mockNotifyMultiple = vi.mocked(notifyMultiple)
const mockPrepareBusinessSend = vi.mocked(prepareBusinessSend)

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TZ = 'Asia/Jerusalem'
const NOW = DateTime.fromISO('2026-08-17T09:00:00', { zone: TZ })

const ORG_ID = 'org-1'
const TEACHER_ID = 'teacher-1'
const REQUEST_ID = 'req-1'
const DECIDER = 'profile-owner'

const CTX = {
  orgId: ORG_ID,
  accessToken: 'token',
  phoneNumberId: 'phone-number-id',
  timezone: TZ,
}

const PENDING_REQUEST = {
  id: REQUEST_ID,
  organization_id: ORG_ID,
  teacher_id: TEACHER_ID,
  start_date: '2026-08-20',
  end_date: '2026-08-22',
  status: 'pending',
  teachers: { profiles: { full_name: 'מיכל' } },
}

/** One parent, reachable, primary on their child's relationship. */
function lessonWithParent(parentId: string, phone: string | null = '+972501111111') {
  return {
    id: `lesson-${parentId}`,
    lesson_students: [
      {
        student: {
          relationships: [{ is_primary: true, parent: { id: parentId, phone, preferred_locale: 'he' } }],
        },
      },
    ],
  }
}

/**
 * Routes each table to a canned result and records what was asked of it.
 * `calls` collects one entry per builder so assertions can inspect filters.
 */
type TableScript = {
  select?: unknown
  update?: unknown
  insert?: unknown
  upsert?: unknown
}

function mockTables(script: Record<string, TableScript>) {
  const calls: Array<{ table: string; op: string; filters: Record<string, unknown>; payload?: unknown }> = []

  mockFrom.mockImplementation((table: string) => {
    const entry = script[table] ?? {}
    const filters: Record<string, unknown> = {}
    let op = 'select'
    let payload: unknown

    const self: Record<string, unknown> = {}
    const record = () => {
      const existing = calls.find((c) => c.table === table && c.op === op && c.filters === filters)
      if (!existing) calls.push({ table, op, filters, payload })
    }

    for (const method of ['eq', 'neq', 'in', 'gte', 'gt', 'lte', 'lt', 'not']) {
      self[method] = (column: string, value: unknown) => {
        filters[`${method}:${column}`] = value
        return self
      }
    }
    for (const method of ['order', 'limit']) {
      self[method] = () => self
    }

    self['select'] = () => self
    self['update'] = (values: unknown) => {
      op = 'update'
      payload = values
      record()
      return self
    }
    self['insert'] = (values: unknown) => {
      op = 'insert'
      payload = values
      record()
      return self
    }
    self['upsert'] = (values: unknown) => {
      op = 'upsert'
      payload = values
      record()
      return self
    }

    const result = () => {
      if (op === 'update') return entry.update ?? { data: [], error: null }
      if (op === 'insert') return entry.insert ?? { data: null, error: null }
      if (op === 'upsert') return entry.upsert ?? { data: null, error: null }
      return entry.select ?? { data: [], error: null, count: 0 }
    }

    self['maybeSingle'] = () => {
      record()
      const r = result() as { data: unknown[] | unknown; error: unknown }
      const data = Array.isArray(r.data) ? (r.data[0] ?? null) : r.data
      return Promise.resolve({ data, error: r.error })
    }
    self['single'] = self['maybeSingle']
    self['then'] = (resolve: (v: unknown) => unknown) => {
      record()
      return Promise.resolve(result()).then(resolve)
    }

    return self
  })

  return calls
}

function findCall(
  calls: ReturnType<typeof mockTables>,
  table: string,
  op: string
): { filters: Record<string, unknown>; payload?: unknown } | undefined {
  return calls.find((c) => c.table === table && c.op === op)
}

beforeEach(() => {
  vi.clearAllMocks()
  Settings.now = () => NOW.toMillis()
  mockSendTemplateWithQuickReplies.mockResolvedValue(undefined)
  mockSendTextMessage.mockResolvedValue(undefined)
})

afterEach(() => {
  Settings.now = () => Date.now()
})

// ── Create ────────────────────────────────────────────────────────────────────

describe('createDayOffRequest', () => {
  it('returns the created request', async () => {
    mockTables({ day_off_requests: { insert: { data: PENDING_REQUEST, error: null } } })

    const result = await createDayOffRequest({
      orgId: ORG_ID,
      teacherId: TEACHER_ID,
      startDate: '2026-08-20',
      endDate: '2026-08-22',
    })

    expect(result).toEqual({
      ok: true,
      request: expect.objectContaining({ id: REQUEST_ID, teacherName: 'מיכל' }),
    })
  })

  it('reads the unique-index violation as "already pending", not a crash', async () => {
    // Two taps of "send request" arrive as two webhook deliveries; the second
    // must land on a friendly reply rather than a 500.
    mockTables({
      day_off_requests: { insert: { data: null, error: { code: '23505', message: 'duplicate' } } },
    })

    const result = await createDayOffRequest({
      orgId: ORG_ID,
      teacherId: TEACHER_ID,
      startDate: '2026-08-20',
      endDate: '2026-08-22',
    })

    expect(result).toEqual({ ok: false, reason: 'already_pending' })
  })
})

describe('getPendingRequests', () => {
  it('scopes to the org and to pending rows', async () => {
    const calls = mockTables({
      day_off_requests: { select: { data: [PENDING_REQUEST], error: null } },
    })

    const requests = await getPendingRequests(ORG_ID)

    expect(requests).toHaveLength(1)
    expect(requests[0].teacherName).toBe('מיכל')
    const call = findCall(calls, 'day_off_requests', 'select')
    expect(call?.filters['eq:organization_id']).toBe(ORG_ID)
    expect(call?.filters['eq:status']).toBe('pending')
  })
})

// ── Approve ───────────────────────────────────────────────────────────────────

/** The common happy-path script: a pending request, one lesson, one parent. */
function approvalScript(overrides: Record<string, TableScript> = {}) {
  return mockTables({
    day_off_requests: {
      select: { data: [PENDING_REQUEST], error: null },
      update: { data: [{ id: REQUEST_ID }], error: null },
    },
    lessons: {
      select: { data: [lessonWithParent('parent-1')], error: null, count: 1 },
      update: { data: [{ id: 'lesson-parent-1' }], error: null },
    },
    teachers: { select: { data: [{ profiles: { phone: '+972529999999', preferred_locale: 'he' } }], error: null } },
    availability_overrides: { upsert: { data: null, error: null } },
    ...overrides,
  })
}

describe('approveDayOffRequest', () => {
  it('blocks one availability override per day in the range', async () => {
    const calls = approvalScript()

    await approveDayOffRequest({ requestId: REQUEST_ID, decidedByProfileId: DECIDER, ctx: CTX })

    const upsert = findCall(calls, 'availability_overrides', 'upsert')
    expect(upsert?.payload).toEqual([
      expect.objectContaining({ override_date: '2026-08-20', is_available: false, teacher_id: TEACHER_ID }),
      expect.objectContaining({ override_date: '2026-08-21', is_available: false }),
      expect.objectContaining({ override_date: '2026-08-22', is_available: false }),
    ])
  })

  it('cancels only this teacher’s still-scheduled lessons, and charges nobody', async () => {
    const calls = approvalScript()

    const outcome = await approveDayOffRequest({
      requestId: REQUEST_ID,
      decidedByProfileId: DECIDER,
      ctx: CTX,
    })

    const update = findCall(calls, 'lessons', 'update')
    expect(update?.payload).toMatchObject({ status: 'cancelled' })
    expect(update?.filters['eq:organization_id']).toBe(ORG_ID)
    expect(update?.filters['eq:teacher_id']).toBe(TEACHER_ID)
    // Already-cancelled lessons are left alone.
    expect(update?.filters['eq:status']).toBe('scheduled')

    // A family does not pay for their teacher's holiday: no charge row, and no
    // cancellation event either — the monthly engine counts those separately.
    expect(calls.some((c) => c.table === 'charges')).toBe(false)
    expect(calls.some((c) => c.table === 'cancellation_events')).toBe(false)

    expect(outcome).toMatchObject({ status: 'approved', lessonsCancelled: 1 })
  })

  it('bounds the cancellation to the requested days in the org’s timezone', async () => {
    const calls = approvalScript()

    await approveDayOffRequest({ requestId: REQUEST_ID, decidedByProfileId: DECIDER, ctx: CTX })

    const update = findCall(calls, 'lessons', 'update')
    // 20/08 00:00 and 23/08 00:00 Jerusalem — the day after the last day off.
    expect(update?.filters['gte:start_at']).toBe(
      DateTime.fromISO('2026-08-20T00:00:00', { zone: TZ }).toUTC().toISO()
    )
    expect(update?.filters['lt:start_at']).toBe(
      DateTime.fromISO('2026-08-23T00:00:00', { zone: TZ }).toUTC().toISO()
    )
  })

  it('sends one notice per parent, not one per lesson', async () => {
    // One parent with two children taught by the same teacher would otherwise
    // get the same message twice.
    approvalScript({
      lessons: {
        select: {
          data: [lessonWithParent('parent-1'), lessonWithParent('parent-1'), lessonWithParent('parent-2')],
          error: null,
        },
        update: { data: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], error: null },
      },
    })

    const outcome = await approveDayOffRequest({
      requestId: REQUEST_ID,
      decidedByProfileId: DECIDER,
      ctx: CTX,
    })

    expect(mockSendTemplateWithQuickReplies).toHaveBeenCalledTimes(2)
    expect(outcome).toMatchObject({ parentsNotified: 2, parentsFailed: 0 })
  })

  // The parent notice sends via sendTemplateWithQuickReplies, not
  // sendSmartMessage, so it used to reach opted-out parents. An opted-out
  // parent is skipped rather than counted as a failure — nothing went wrong.
  it('skips an opted-out parent without counting them as failed', async () => {
    const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    approvalScript({
      lessons: {
        select: {
          data: [lessonWithParent('parent-1'), lessonWithParent('parent-2')],
          error: null,
        },
        update: { data: [{ id: 'a' }, { id: 'b' }], error: null },
      },
    })
    mockPrepareBusinessSend
      .mockResolvedValueOnce({ ok: false, reason: 'opted_out' })
      .mockResolvedValueOnce({ ok: true })

    const outcome = await approveDayOffRequest({
      requestId: REQUEST_ID,
      decidedByProfileId: DECIDER,
      ctx: CTX,
    })

    expect(mockSendTemplateWithQuickReplies).toHaveBeenCalledTimes(1)
    expect(outcome).toMatchObject({ parentsNotified: 1, parentsFailed: 0 })

    consoleInfoSpy.mockRestore()
  })

  it('carries the rebooking payload so the parent gets a fresh link on tap', async () => {
    approvalScript()

    await approveDayOffRequest({ requestId: REQUEST_ID, decidedByProfileId: DECIDER, ctx: CTX })

    // A URL baked into the body would be a 15-minute token, expired by the time
    // anyone read it. The button runs the ordinary booking flow instead.
    expect(mockSendTemplateWithQuickReplies).toHaveBeenCalledWith(
      '+972501111111',
      expect.objectContaining({ payloads: ['m:book'] }),
      'token',
      'phone-number-id'
    )
  })

  it('falls back to text when the template send fails', async () => {
    approvalScript()
    mockSendTemplateWithQuickReplies.mockRejectedValue(new Error('132001 template not found'))

    const outcome = await approveDayOffRequest({
      requestId: REQUEST_ID,
      decidedByProfileId: DECIDER,
      ctx: CTX,
    })

    expect(mockSendTextMessage).toHaveBeenCalledTimes(1)
    expect(outcome).toMatchObject({ parentsNotified: 1, parentsFailed: 0 })
  })

  it('keeps notifying the rest when one parent is unreachable', async () => {
    approvalScript({
      lessons: {
        select: {
          data: [lessonWithParent('parent-1'), lessonWithParent('parent-2', '+972502222222')],
          error: null,
        },
        update: { data: [{ id: 'a' }, { id: 'b' }], error: null },
      },
    })
    mockSendTemplateWithQuickReplies.mockRejectedValue(new Error('131026 not on WhatsApp'))
    mockSendTextMessage
      .mockRejectedValueOnce(new Error('131026 not on WhatsApp'))
      .mockResolvedValueOnce(undefined)

    const outcome = await approveDayOffRequest({
      requestId: REQUEST_ID,
      decidedByProfileId: DECIDER,
      ctx: CTX,
    })

    // The failure is counted, not thrown — the cancellation is already committed.
    expect(outcome).toMatchObject({ status: 'approved', parentsNotified: 1, parentsFailed: 1 })
  })

  it('skips a parent with no phone on file', async () => {
    approvalScript({
      lessons: {
        select: { data: [lessonWithParent('parent-1', null)], error: null },
        update: { data: [{ id: 'a' }], error: null },
      },
    })

    const outcome = await approveDayOffRequest({
      requestId: REQUEST_ID,
      decidedByProfileId: DECIDER,
      ctx: CTX,
    })

    expect(mockSendTemplateWithQuickReplies).not.toHaveBeenCalled()
    expect(outcome).toMatchObject({ status: 'approved', parentsNotified: 0, parentsFailed: 0 })
  })

  it('still blocks the days when no lessons are affected', async () => {
    const calls = approvalScript({
      lessons: { select: { data: [], error: null }, update: { data: [], error: null } },
    })

    const outcome = await approveDayOffRequest({
      requestId: REQUEST_ID,
      decidedByProfileId: DECIDER,
      ctx: CTX,
    })

    expect(findCall(calls, 'availability_overrides', 'upsert')).toBeDefined()
    expect(outcome).toMatchObject({ status: 'approved', lessonsCancelled: 0, parentsNotified: 0 })
  })

  it('tells the teacher, through the window-aware sender', async () => {
    approvalScript()

    await approveDayOffRequest({ requestId: REQUEST_ID, decidedByProfileId: DECIDER, ctx: CTX })

    // The decision can land days after the teacher last wrote in.
    expect(mockSendSmartMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: '+972529999999',
        templateType: 'day_off_decision',
        vars: expect.objectContaining({ date_range: '20/08–22/08', decision: 'אושרה' }),
      })
    )
    expect(mockNotifyMultiple).toHaveBeenCalledWith(
      ORG_ID,
      ['teacher-profile-1'],
      'day_off_decided',
      expect.any(String),
      expect.any(String),
      expect.any(String)
    )
  })

  it('claims the row only while it is still pending', async () => {
    const calls = approvalScript()

    await approveDayOffRequest({ requestId: REQUEST_ID, decidedByProfileId: DECIDER, ctx: CTX })

    const claim = findCall(calls, 'day_off_requests', 'update')
    expect(claim?.payload).toMatchObject({ status: 'approved', decided_by: DECIDER })
    // The guard that makes two admins tapping at once safe.
    expect(claim?.filters['eq:status']).toBe('pending')
    expect(claim?.filters['eq:organization_id']).toBe(ORG_ID)
  })

  it('runs no side effects when another admin already decided it', async () => {
    // The guarded update matches nothing — someone got there first.
    const calls = approvalScript({
      day_off_requests: {
        select: { data: [PENDING_REQUEST], error: null },
        update: { data: [], error: null },
      },
    })

    const outcome = await approveDayOffRequest({
      requestId: REQUEST_ID,
      decidedByProfileId: DECIDER,
      ctx: CTX,
    })

    expect(outcome).toEqual({ status: 'already_decided' })
    expect(findCall(calls, 'lessons', 'update')).toBeUndefined()
    expect(findCall(calls, 'availability_overrides', 'upsert')).toBeUndefined()
    expect(mockSendTemplateWithQuickReplies).not.toHaveBeenCalled()
  })

  it('refuses a request that is not pending any more', async () => {
    approvalScript({
      day_off_requests: {
        select: { data: [{ ...PENDING_REQUEST, status: 'approved' }], error: null },
      },
    })

    const outcome = await approveDayOffRequest({
      requestId: REQUEST_ID,
      decidedByProfileId: DECIDER,
      ctx: CTX,
    })

    expect(outcome).toEqual({ status: 'already_decided' })
  })

  it('refuses an id from another org', async () => {
    // The org-scoped lookup is the authorisation check for a client-supplied id.
    approvalScript({ day_off_requests: { select: { data: [], error: null } } })

    const outcome = await approveDayOffRequest({
      requestId: 'someone-elses-request',
      decidedByProfileId: DECIDER,
      ctx: CTX,
    })

    expect(outcome).toEqual({ status: 'not_found' })
  })

  it('hands the request back when the cancellation itself fails', async () => {
    // Otherwise a retry answers "already decided" and the owner believes their
    // approval went through while nothing was actually cancelled.
    const calls = approvalScript({
      lessons: {
        select: { data: [lessonWithParent('parent-1')], error: null },
        update: { data: null, error: { code: '500', message: 'db exploded' } },
      },
    })

    await expect(
      approveDayOffRequest({ requestId: REQUEST_ID, decidedByProfileId: DECIDER, ctx: CTX })
    ).rejects.toThrow()

    const reopen = calls.filter((c) => c.table === 'day_off_requests' && c.op === 'update').at(-1)
    expect(reopen?.payload).toMatchObject({ status: 'pending', decided_by: null })
    expect(mockSendTemplateWithQuickReplies).not.toHaveBeenCalled()
  })

  it('closes a request whose dates have already passed instead of cancelling nothing', async () => {
    const calls = approvalScript({
      day_off_requests: {
        select: { data: [{ ...PENDING_REQUEST, start_date: '2026-08-10', end_date: '2026-08-12' }], error: null },
        update: { data: [{ id: REQUEST_ID }], error: null },
      },
    })

    const outcome = await approveDayOffRequest({
      requestId: REQUEST_ID,
      decidedByProfileId: DECIDER,
      ctx: CTX,
    })

    expect(outcome).toMatchObject({ status: 'stale' })
    const claim = findCall(calls, 'day_off_requests', 'update')
    expect(claim?.payload).toMatchObject({ status: 'rejected' })
    expect(findCall(calls, 'lessons', 'update')).toBeUndefined()
  })
})

// ── Reject ────────────────────────────────────────────────────────────────────

describe('rejectDayOffRequest', () => {
  it('records the decision and tells the teacher, touching no lessons', async () => {
    const calls = approvalScript()

    const outcome = await rejectDayOffRequest({
      requestId: REQUEST_ID,
      decidedByProfileId: DECIDER,
      ctx: CTX,
    })

    expect(outcome).toMatchObject({ status: 'rejected' })
    expect(findCall(calls, 'day_off_requests', 'update')?.payload).toMatchObject({
      status: 'rejected',
      decided_by: DECIDER,
    })
    expect(findCall(calls, 'lessons', 'update')).toBeUndefined()
    expect(findCall(calls, 'availability_overrides', 'upsert')).toBeUndefined()
    expect(mockSendSmartMessage).toHaveBeenCalledWith(
      expect.objectContaining({ vars: expect.objectContaining({ decision: 'נדחתה' }) })
    )
  })

  it('loses the race gracefully', async () => {
    approvalScript({
      day_off_requests: {
        select: { data: [PENDING_REQUEST], error: null },
        update: { data: [], error: null },
      },
    })

    const outcome = await rejectDayOffRequest({
      requestId: REQUEST_ID,
      decidedByProfileId: DECIDER,
      ctx: CTX,
    })

    expect(outcome).toEqual({ status: 'already_decided' })
    expect(mockSendSmartMessage).not.toHaveBeenCalled()
  })
})
