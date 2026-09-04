import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFrom = vi.fn()

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({ from: (t: string) => mockFrom(t) }),
}))

vi.mock('./index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./index')>()),
  checkCalendarConflicts: vi.fn(),
}))

import { checkCalendarConflicts } from './index'
import { getExternalBusyIntervals, mergeBusyIntervals } from './getExternalBusyIntervals'

const mockCheck = vi.mocked(checkCalendarConflicts)

function buildChain(result: unknown) {
  const self: Record<string, unknown> = {}
  const pass = () => self
  ;['select', 'eq'].forEach(m => { self[m] = pass })
  self['maybeSingle'] = () => Promise.resolve(result)
  return self
}

describe('mergeBusyIntervals', () => {
  it('coalesces overlapping intervals', () => {
    expect(
      mergeBusyIntervals([
        { start: '2026-09-06T10:00:00Z', end: '2026-09-06T11:00:00Z' },
        { start: '2026-09-06T10:30:00Z', end: '2026-09-06T12:00:00Z' },
      ])
    ).toEqual([{ start: '2026-09-06T10:00:00Z', end: '2026-09-06T12:00:00Z' }])
  })

  it('coalesces touching intervals', () => {
    expect(
      mergeBusyIntervals([
        { start: '2026-09-06T10:00:00Z', end: '2026-09-06T11:00:00Z' },
        { start: '2026-09-06T11:00:00Z', end: '2026-09-06T12:00:00Z' },
      ])
    ).toEqual([{ start: '2026-09-06T10:00:00Z', end: '2026-09-06T12:00:00Z' }])
  })

  it('keeps disjoint intervals apart and sorts unsorted input', () => {
    expect(
      mergeBusyIntervals([
        { start: '2026-09-06T14:00:00Z', end: '2026-09-06T15:00:00Z' },
        { start: '2026-09-06T10:00:00Z', end: '2026-09-06T11:00:00Z' },
      ])
    ).toEqual([
      { start: '2026-09-06T10:00:00Z', end: '2026-09-06T11:00:00Z' },
      { start: '2026-09-06T14:00:00Z', end: '2026-09-06T15:00:00Z' },
    ])
  })

  it('does not shrink an interval contained in the previous one', () => {
    expect(
      mergeBusyIntervals([
        { start: '2026-09-06T10:00:00Z', end: '2026-09-06T14:00:00Z' },
        { start: '2026-09-06T11:00:00Z', end: '2026-09-06T12:00:00Z' },
      ])
    ).toEqual([{ start: '2026-09-06T10:00:00Z', end: '2026-09-06T14:00:00Z' }])
  })

  it('returns [] for no input', () => {
    expect(mergeBusyIntervals([])).toEqual([])
  })
})

describe('getExternalBusyIntervals', () => {
  const PARAMS = {
    orgId: 'org-1',
    teacherId: 'teacher-1',
    windowStartUtc: '2026-09-06T00:00:00Z',
    windowEndUtc: '2026-09-06T23:59:59Z',
  }

  beforeEach(() => vi.clearAllMocks())

  it('returns [] without calling Google when neither calendar is connected', async () => {
    mockFrom.mockImplementation(() => buildChain({ data: null, error: null }))

    expect(await getExternalBusyIntervals(PARAMS)).toEqual([])
    expect(mockCheck).not.toHaveBeenCalled()
  })

  it('queries the whole window once and merges the returned conflicts', async () => {
    mockFrom.mockImplementation((table: string) =>
      buildChain(
        table === 'organizations'
          ? { data: { google_calendar_refresh_token: 'enc-org', google_calendar_selected_calendars: null }, error: null }
          : { data: { google_calendar_refresh_token: 'enc-teacher', google_calendar_selected_calendars: null }, error: null }
      )
    )
    mockCheck.mockResolvedValue([
      { start: '2026-09-06T10:00:00Z', end: '2026-09-06T11:00:00Z', calendar: 'org', label: null },
      { start: '2026-09-06T10:30:00Z', end: '2026-09-06T12:00:00Z', calendar: 'teacher', label: null },
    ])

    const busy = await getExternalBusyIntervals(PARAMS)

    expect(mockCheck).toHaveBeenCalledTimes(1)
    expect(mockCheck).toHaveBeenCalledWith(
      expect.objectContaining({
        orgEncryptedToken: 'enc-org',
        teacherEncryptedToken: 'enc-teacher',
        timeMin: PARAMS.windowStartUtc,
        timeMax: PARAMS.windowEndUtc,
      })
    )
    expect(busy).toEqual([{ start: '2026-09-06T10:00:00Z', end: '2026-09-06T12:00:00Z' }])
  })

  it('calls Google when only one level is connected', async () => {
    mockFrom.mockImplementation((table: string) =>
      buildChain(
        table === 'teachers'
          ? { data: { google_calendar_refresh_token: 'enc-teacher', google_calendar_selected_calendars: null }, error: null }
          : { data: null, error: null }
      )
    )
    mockCheck.mockResolvedValue([])

    expect(await getExternalBusyIntervals(PARAMS)).toEqual([])
    expect(mockCheck).toHaveBeenCalledTimes(1)
  })
})
