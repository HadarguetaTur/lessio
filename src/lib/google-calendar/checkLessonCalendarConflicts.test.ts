/**
 * The staff-side conflict check around a dead Google connection.
 *
 * A refresh token Google refuses (invalid_grant) used to be re-tried on every
 * lesson, and every retry raised the "could not read your calendar" dialog —
 * which, rendered under the "conflict found" headline, staff read as a phantom
 * event. The first refusal now flags the connection; a flagged level is
 * skipped, exactly as if it were disconnected, until it is reconnected.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFrom = vi.fn()

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({ from: (t: string) => mockFrom(t) }),
}))

vi.mock('./index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./index')>()),
  checkCalendarConflicts: vi.fn(),
}))

vi.mock('./markNeedsReauth', () => ({
  markCalendarConnectionsRevoked: vi.fn(),
}))

import { checkCalendarConflicts, usableCalendarToken } from './index'
import { markCalendarConnectionsRevoked } from './markNeedsReauth'
import { checkLessonCalendarConflicts } from './checkLessonCalendarConflicts'

const mockCheck = vi.mocked(checkCalendarConflicts)
const mockMark = vi.mocked(markCalendarConnectionsRevoked)

function buildChain(result: unknown) {
  const self: Record<string, unknown> = {}
  const pass = () => self
  ;['select', 'eq'].forEach(m => { self[m] = pass })
  self['maybeSingle'] = () => Promise.resolve(result)
  return self
}

const PARAMS = {
  orgId: 'org-1',
  teacherId: 'teacher-1',
  date: '2027-01-19',
  startTime: '18:00',
  durationMinutes: 60,
}

const HEALTHY = {
  google_calendar_refresh_token: 'enc-token',
  google_calendar_selected_calendars: [{ id: 'primary' }],
  google_calendar_needs_reauth_at: null,
  timezone: 'Asia/Jerusalem',
}

function rows(org: unknown, teacher: unknown) {
  mockFrom.mockImplementation((table: string) =>
    buildChain({ data: table === 'organizations' ? org : teacher, error: null })
  )
}

describe('usableCalendarToken', () => {
  it('returns the token for a healthy connection', () => {
    expect(usableCalendarToken(HEALTHY)).toBe('enc-token')
  })

  it('treats a flagged connection as disconnected', () => {
    expect(
      usableCalendarToken({ ...HEALTHY, google_calendar_needs_reauth_at: '2026-09-14T10:00:00Z' })
    ).toBeNull()
  })

  it('returns null with no token or no row', () => {
    expect(usableCalendarToken({ ...HEALTHY, google_calendar_refresh_token: null })).toBeNull()
    expect(usableCalendarToken(null)).toBeNull()
  })
})

describe('checkLessonCalendarConflicts', () => {
  beforeEach(() => vi.clearAllMocks())

  it('asks Google with both tokens when both connections are healthy', async () => {
    rows(HEALTHY, { ...HEALTHY, google_calendar_refresh_token: 'enc-teacher' })
    mockCheck.mockResolvedValue({
      status: 'free', conflicts: [], unreachable: [], revoked: [], erroredCalendarIds: [],
    })

    const result = await checkLessonCalendarConflicts(PARAMS)

    expect(result).toEqual({ conflicts: [], status: 'free' })
    expect(mockCheck).toHaveBeenCalledWith(
      expect.objectContaining({ orgEncryptedToken: 'enc-token', teacherEncryptedToken: 'enc-teacher' })
    )
    // 18:00 Jerusalem in January is 16:00 UTC.
    expect(mockCheck.mock.calls[0][0].timeMin).toBe('2027-01-19T16:00:00.000Z')
    expect(mockCheck.mock.calls[0][0].timeMax).toBe('2027-01-19T17:00:00.000Z')
  })

  it('skips a level that is flagged needs_reauth and reports free when nothing else is connected', async () => {
    // The Raz case: the org token was refused once, the flag is set, and no
    // teacher calendar is connected. Nothing to ask → free, no dialog, and no
    // Google traffic.
    rows(
      { ...HEALTHY, google_calendar_needs_reauth_at: '2026-09-14T10:00:00Z' },
      { ...HEALTHY, google_calendar_refresh_token: null }
    )

    const result = await checkLessonCalendarConflicts(PARAMS)

    expect(result).toEqual({ conflicts: [], status: 'free' })
    expect(mockCheck).not.toHaveBeenCalled()
  })

  it('still asks the healthy level when the other is flagged', async () => {
    rows(
      { ...HEALTHY, google_calendar_needs_reauth_at: '2026-09-14T10:00:00Z' },
      { ...HEALTHY, google_calendar_refresh_token: 'enc-teacher' }
    )
    mockCheck.mockResolvedValue({
      status: 'free', conflicts: [], unreachable: [], revoked: [], erroredCalendarIds: [],
    })

    await checkLessonCalendarConflicts(PARAMS)

    expect(mockCheck).toHaveBeenCalledWith(
      expect.objectContaining({ orgEncryptedToken: null, teacherEncryptedToken: 'enc-teacher' })
    )
  })

  it('flags the connection Google refused, and still reports the failure this once', async () => {
    rows(HEALTHY, { ...HEALTHY, google_calendar_refresh_token: null })
    mockCheck.mockResolvedValue({
      status: 'unknown_provider_error',
      conflicts: [],
      unreachable: ['org'],
      revoked: ['org'],
      erroredCalendarIds: [],
    })

    const result = await checkLessonCalendarConflicts(PARAMS)

    expect(result.status).toBe('unknown_provider_error')
    expect(mockMark).toHaveBeenCalledWith({ orgId: 'org-1', teacherId: 'teacher-1', revoked: ['org'] })
  })

  it('does not flag anything for a transient failure', async () => {
    rows(HEALTHY, { ...HEALTHY, google_calendar_refresh_token: null })
    mockCheck.mockResolvedValue({
      status: 'unknown_provider_error',
      conflicts: [],
      unreachable: ['org'],
      revoked: [],
      erroredCalendarIds: [],
    })

    await checkLessonCalendarConflicts(PARAMS)

    expect(mockMark).toHaveBeenCalledWith(expect.objectContaining({ revoked: [] }))
  })

  it('reports unknown_provider_error when the token lookup itself fails', async () => {
    mockFrom.mockImplementation(() => buildChain({ data: null, error: { message: 'boom' } }))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await checkLessonCalendarConflicts(PARAMS)

    expect(result.status).toBe('unknown_provider_error')
    expect(mockCheck).not.toHaveBeenCalled()
  })
})
