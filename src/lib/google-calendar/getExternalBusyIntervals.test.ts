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
import { getExternalBusy, getExternalBusyIntervals, mergeBusyIntervals } from './getExternalBusyIntervals'

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
    mockCheck.mockResolvedValue({
      status: 'busy',
      conflicts: [
        { start: '2026-09-06T10:00:00Z', end: '2026-09-06T11:00:00Z', calendar: 'org', label: null },
        { start: '2026-09-06T10:30:00Z', end: '2026-09-06T12:00:00Z', calendar: 'teacher', label: null },
      ],
      unreachable: [],
      revoked: [],
      erroredCalendarIds: [],
    })

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

  it('reports UNKNOWN when the token lookup itself fails', async () => {
    // Regression: the `error` half of `{ data, error }` was discarded, so a
    // transient PostgREST/network failure on the TOKEN lookup was indistinguish-
    // able from "no calendar connected" and returned a hard 'free'. That made
    // `createSlotLock`'s fail-closed branch unreachable — the tri-state was
    // there, but nothing could ever put it in the third state from here.
    mockFrom.mockImplementation((table: string) =>
      buildChain(
        table === 'organizations'
          ? { data: null, error: { message: 'connection reset', code: '08006' } }
          : { data: null, error: null }
      )
    )

    const result = await getExternalBusy(PARAMS)

    expect(result.status).toBe('unknown_provider_error')
    expect(result.intervals).toEqual([])
    // And it must not silently pretend it asked Google either.
    expect(mockCheck).not.toHaveBeenCalled()
  })

  it('reports UNKNOWN when the TEACHER row is the one that fails', async () => {
    mockFrom.mockImplementation((table: string) =>
      buildChain(
        table === 'teachers'
          ? { data: null, error: { message: 'timeout' } }
          : { data: null, error: null }
      )
    )

    expect((await getExternalBusy(PARAMS)).status).toBe('unknown_provider_error')
  })

  it('calls Google when only one level is connected', async () => {
    mockFrom.mockImplementation((table: string) =>
      buildChain(
        table === 'teachers'
          ? { data: { google_calendar_refresh_token: 'enc-teacher', google_calendar_selected_calendars: null }, error: null }
          : { data: null, error: null }
      )
    )
    mockCheck.mockResolvedValue({
      status: 'free',
      conflicts: [],
      unreachable: [],
      revoked: [],
      erroredCalendarIds: [],
    })

    expect(await getExternalBusyIntervals(PARAMS)).toEqual([])
    expect(mockCheck).toHaveBeenCalledTimes(1)
  })
})

/**
 * INT-01. A revoked refresh token, a 403, an outage and the timeout used to
 * arrive as an empty array, exactly like a genuinely empty calendar.
 */
describe('getExternalBusy — the tri-state', () => {
  const PARAMS = {
    orgId: 'org-1',
    teacherId: 'teacher-1',
    windowStartUtc: '2026-09-06T00:00:00Z',
    windowEndUtc: '2026-09-06T23:59:59Z',
  }

  function connected() {
    mockFrom.mockImplementation(() =>
      buildChain({
        data: {
          google_calendar_refresh_token: 'enc',
          google_calendar_selected_calendars: null,
        },
        error: null,
      })
    )
  }

  beforeEach(() => vi.clearAllMocks())

  it('reports free when no calendar is connected, without asking Google', async () => {
    mockFrom.mockImplementation(() => buildChain({ data: null, error: null }))

    expect(await getExternalBusy(PARAMS)).toEqual({ intervals: [], status: 'free' })
    expect(mockCheck).not.toHaveBeenCalled()
  })

  it('carries an unknown_provider_error through instead of reporting free', async () => {
    connected()
    mockCheck.mockResolvedValue({
      status: 'unknown_provider_error',
      conflicts: [],
      unreachable: ['teacher'],
      revoked: [],
      erroredCalendarIds: [],
    })

    const result = await getExternalBusy(PARAMS)

    expect(result.status).toBe('unknown_provider_error')
    expect(result.intervals).toEqual([])
  })

  it('the advisory shorthand still fails open on the listing surfaces', async () => {
    // Deliberate: a Google outage must not empty the calendar a parent is
    // browsing. Only the write path refuses.
    connected()
    mockCheck.mockResolvedValue({
      status: 'unknown_provider_error',
      conflicts: [],
      unreachable: ['org'],
      revoked: [],
      erroredCalendarIds: [],
    })

    expect(await getExternalBusyIntervals(PARAMS)).toEqual([])
  })
})
