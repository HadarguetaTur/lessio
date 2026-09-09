/**
 * INT-01 — the freeBusy tri-state.
 *
 * checkCalendarConflicts caught every failure and returned an empty array, so
 * "this calendar is free" and "we could not read this calendar" were the same
 * value. A teacher whose Google connection had silently expired read as
 * permanently free, and the parent booking path happily wrote lessons over
 * every real event in their diary.
 *
 * These tests drive the real function against a stubbed global fetch.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { checkCalendarConflicts, GOOGLE_TIMEOUT_MS } from './index'

vi.mock('@/lib/crypto', () => ({
  decryptCalendarToken: (t: string) => `decrypted-${t}`,
}))

const CALENDARS = [{ id: 'primary', summary: null }]
const BASE = {
  orgEncryptedToken: null,
  teacherEncryptedToken: 'enc-teacher',
  orgSelectedCalendars: CALENDARS,
  teacherSelectedCalendars: CALENDARS,
  timeMin: '2027-01-19T16:00:00.000Z',
  timeMax: '2027-01-19T17:00:00.000Z',
}

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response
}

const TOKEN_OK = jsonResponse({ access_token: 'at' })

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  process.env.GOOGLE_CLIENT_ID = 'cid'
  process.env.GOOGLE_CLIENT_SECRET = 'secret'
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('checkCalendarConflicts', () => {
  it('reports free for a calendar that answers with nothing busy', async () => {
    fetchMock
      .mockResolvedValueOnce(TOKEN_OK)
      .mockResolvedValueOnce(jsonResponse({ calendars: { primary: { busy: [] } } }))

    const result = await checkCalendarConflicts(BASE)

    expect(result.status).toBe('free')
    expect(result.conflicts).toEqual([])
    expect(result.unreachable).toEqual([])
  })

  it('reports busy with the intervals it found', async () => {
    fetchMock.mockResolvedValueOnce(TOKEN_OK).mockResolvedValueOnce(
      jsonResponse({
        calendars: {
          primary: { busy: [{ start: BASE.timeMin, end: BASE.timeMax }] },
        },
      })
    )

    const result = await checkCalendarConflicts(BASE)

    expect(result.status).toBe('busy')
    expect(result.conflicts).toEqual([
      { start: BASE.timeMin, end: BASE.timeMax, calendar: 'teacher', label: null },
    ])
  })

  // ── The finding ────────────────────────────────────────────────────────────

  it('reports unknown_provider_error for a revoked refresh token', async () => {
    // Google answers the refresh with invalid_grant once the user has revoked
    // access. This must never read as an empty calendar.
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'invalid_grant' }, false, 400))

    const result = await checkCalendarConflicts(BASE)

    expect(result.status).toBe('unknown_provider_error')
    expect(result.conflicts).toEqual([])
    expect(result.unreachable).toEqual(['teacher'])
  })

  it('reports unknown_provider_error when the request times out', async () => {
    fetchMock.mockResolvedValueOnce(TOKEN_OK).mockRejectedValueOnce(
      Object.assign(new Error('The operation was aborted due to timeout'), {
        name: 'TimeoutError',
      })
    )

    const result = await checkCalendarConflicts(BASE)

    expect(result.status).toBe('unknown_provider_error')
    expect(result.unreachable).toEqual(['teacher'])
  })

  it('bounds every Google call with an abort signal', async () => {
    fetchMock
      .mockResolvedValueOnce(TOKEN_OK)
      .mockResolvedValueOnce(jsonResponse({ calendars: { primary: { busy: [] } } }))

    await checkCalendarConflicts(BASE)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    for (const call of fetchMock.mock.calls) {
      expect(call[1]?.signal).toBeInstanceOf(AbortSignal)
    }
    expect(GOOGLE_TIMEOUT_MS).toBeGreaterThan(0)
  })

  it('reports unknown_provider_error when the response errors on one calendar', async () => {
    // A per-calendar error was computed and then only logged; a calendar the
    // account can no longer see silently contributed no busy time.
    fetchMock.mockResolvedValueOnce(TOKEN_OK).mockResolvedValueOnce(
      jsonResponse({
        calendars: { primary: { errors: [{ domain: 'global', reason: 'notFound' }] } },
      })
    )

    const result = await checkCalendarConflicts(BASE)

    expect(result.status).toBe('unknown_provider_error')
    expect(result.erroredCalendarIds).toEqual(['primary'])
  })

  it('still reports busy when one level fails and the other found a conflict', async () => {
    // A conflict we did find is the cautious answer, so it outranks the partial
    // failure: 'busy' blocks or warns either way.
    fetchMock
      // org level: token refresh fails
      .mockResolvedValueOnce(jsonResponse({ error: 'invalid_grant' }, false, 400))
      // teacher level: answers, and is busy
      .mockResolvedValueOnce(TOKEN_OK)
      .mockResolvedValueOnce(
        jsonResponse({
          calendars: { primary: { busy: [{ start: BASE.timeMin, end: BASE.timeMax }] } },
        })
      )

    const result = await checkCalendarConflicts({ ...BASE, orgEncryptedToken: 'enc-org' })

    expect(result.status).toBe('busy')
    expect(result.unreachable).toEqual(['org'])
    expect(result.conflicts).toHaveLength(1)
  })

  it('never throws, whatever Google does', async () => {
    fetchMock.mockRejectedValue(new Error('ENOTFOUND oauth2.googleapis.com'))

    await expect(
      checkCalendarConflicts({ ...BASE, orgEncryptedToken: 'enc-org' })
    ).resolves.toMatchObject({ status: 'unknown_provider_error' })
  })
})
