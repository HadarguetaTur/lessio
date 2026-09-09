/**
 * Google Calendar OAuth2 + freebusy helpers — Sprint 29.
 *
 * Flow:
 *   1. buildCalendarAuthUrl(state)    → redirect user to Google consent
 *   2. exchangeCalendarCode(code)     → get access_token + refresh_token + email
 *   3. checkFreeBusy(...)             → returns busy intervals for a time range
 *
 * Refresh tokens are stored encrypted via encryptCalendarToken / decryptCalendarToken.
 */

import { decryptCalendarToken } from '@/lib/crypto'
import { getShareableBaseUrl } from '@/lib/url/appUrl'

const GOOGLE_TOKEN_URL         = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO_URL      = 'https://www.googleapis.com/oauth2/v2/userinfo'
const GOOGLE_FREEBUSY_URL      = 'https://www.googleapis.com/calendar/v3/freeBusy'
const GOOGLE_CALENDAR_LIST_URL = 'https://www.googleapis.com/calendar/v3/users/me/calendarList'

export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'

/**
 * Every call to Google is bounded. There was no timeout at all: a hung socket
 * held a Server Action open until the platform killed it, and the parent saw a
 * booking that never answered rather than a slot list.
 */
export const GOOGLE_TIMEOUT_MS = 8000

function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS) })
}

/**
 * Google's granular consent screen lets the user approve the connection while
 * leaving the calendar checkbox unticked — the code exchange still succeeds
 * with only the email scope, and every later freeBusy call fails 403.
 * The callback uses this to reject such connections up front.
 */
export function hasCalendarScope(scope: string | null | undefined): boolean {
  return (scope ?? '').split(/\s+/).includes(CALENDAR_SCOPE)
}

function getCallbackUrl(): string {
  return `${getShareableBaseUrl()}/api/google-calendar/callback`
}

// ── OAuth URL ────────────────────────────────────────────────────────────────

export function buildCalendarAuthUrl(state: string, target: 'org' | 'teacher'): string {
  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!clientId) throw new Error('[google-calendar] GOOGLE_CLIENT_ID is not set')

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getCallbackUrl(),
    response_type: 'code',
    scope: `${CALENDAR_SCOPE} email`,
    access_type: 'offline',
    prompt: 'consent',
    state: `${state}:${target}`,
  })

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

// ── Code exchange ────────────────────────────────────────────────────────────

export interface CalendarTokens {
  accessToken: string
  refreshToken: string
  email: string
  /** Space-separated scopes Google actually granted (granular consent). */
  scope: string
}

export async function exchangeCalendarCode(code: string): Promise<CalendarTokens> {
  const clientId     = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('[google-calendar] GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is not set')
  }

  const tokenRes = await fetchWithTimeout(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     clientId,
      client_secret: clientSecret,
      redirect_uri:  getCallbackUrl(),
      grant_type:    'authorization_code',
      code,
    }).toString(),
  })

  if (!tokenRes.ok) {
    const body = await tokenRes.text().catch(() => '')
    throw new Error(`[google-calendar] Token exchange failed ${tokenRes.status}: ${body}`)
  }

  const tokenJson = await tokenRes.json() as {
    access_token?:  string
    refresh_token?: string
    scope?:         string
    error?:         string
  }

  if (!tokenJson.access_token || !tokenJson.refresh_token) {
    throw new Error(`[google-calendar] Token exchange: missing tokens — ${JSON.stringify(tokenJson)}`)
  }

  const userRes = await fetchWithTimeout(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  })

  if (!userRes.ok) {
    throw new Error(`[google-calendar] Userinfo fetch failed ${userRes.status}`)
  }

  const userJson = await userRes.json() as { email?: string }
  if (!userJson.email) {
    throw new Error('[google-calendar] Userinfo response missing email')
  }

  return {
    accessToken:  tokenJson.access_token,
    refreshToken: tokenJson.refresh_token,
    email:        userJson.email,
    scope:        tokenJson.scope ?? '',
  }
}

// ── Token refresh ────────────────────────────────────────────────────────────

async function getAccessToken(encryptedRefreshToken: string): Promise<string> {
  const refreshToken = decryptCalendarToken(encryptedRefreshToken)
  const clientId     = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('[google-calendar] GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is not set')
  }

  const res = await fetchWithTimeout(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     clientId,
      client_secret: clientSecret,
      grant_type:    'refresh_token',
      refresh_token: refreshToken,
    }).toString(),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`[google-calendar] Token refresh failed ${res.status}: ${body}`)
  }

  const json = await res.json() as { access_token?: string }
  if (!json.access_token) {
    throw new Error('[google-calendar] Token refresh: missing access_token')
  }
  return json.access_token
}

// ── Calendar selection ───────────────────────────────────────────────────────

/** One calendar chosen for conflict checks. `summary` is null for `primary` (labelled via i18n). */
export interface SelectedCalendar {
  id:      string
  summary: string | null
}

/** A calendar as offered by Google's calendarList for the picker UI. */
export interface CalendarListEntry {
  id:      string
  summary: string
  primary: boolean
}

export const DEFAULT_SELECTED_CALENDARS: SelectedCalendar[] = [{ id: 'primary', summary: null }]

/** Normalizes the raw jsonb column value; anything malformed falls back to the default. */
export function resolveSelectedCalendars(raw: unknown): SelectedCalendar[] {
  if (!Array.isArray(raw)) return DEFAULT_SELECTED_CALENDARS
  const valid: SelectedCalendar[] = []
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue
    const { id, summary } = entry as { id?: unknown; summary?: unknown }
    if (typeof id !== 'string' || id.length === 0) continue
    valid.push({ id, summary: typeof summary === 'string' ? summary : null })
  }
  return valid.length > 0 ? valid : DEFAULT_SELECTED_CALENDARS
}

/**
 * Lists the account's calendars for the picker. The primary calendar is
 * normalized to the id `primary` so it lines up with the stored default
 * selection (freeBusy accepts the alias).
 */
export async function listCalendars(encryptedRefreshToken: string): Promise<CalendarListEntry[]> {
  const accessToken = await getAccessToken(encryptedRefreshToken)

  const entries: CalendarListEntry[] = []
  let pageToken: string | undefined

  do {
    const params = new URLSearchParams({ minAccessRole: 'freeBusyReader' })
    if (pageToken) params.set('pageToken', pageToken)

    const res = await fetchWithTimeout(`${GOOGLE_CALENDAR_LIST_URL}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`[google-calendar] CalendarList request failed ${res.status}: ${body}`)
    }

    const json = await res.json() as {
      items?:         { id?: string; summary?: string; primary?: boolean }[]
      nextPageToken?: string
    }

    for (const item of json.items ?? []) {
      if (!item.id) continue
      const primary = Boolean(item.primary)
      entries.push({
        id:      primary ? 'primary' : item.id,
        summary: item.summary ?? item.id,
        primary,
      })
    }
    pageToken = json.nextPageToken
  } while (pageToken)

  return entries.sort(
    (a, b) => Number(b.primary) - Number(a.primary) || a.summary.localeCompare(b.summary)
  )
}

// ── FreeBusy ─────────────────────────────────────────────────────────────────

export interface CalendarConflict {
  start:    string
  end:      string
  calendar: 'org' | 'teacher'
  /** Selected calendar's display name; null for the primary calendar. */
  label:    string | null
}

interface FreeBusyResponse {
  calendars?: Record<string, {
    busy?:   { start: string; end: string }[]
    errors?: { domain: string; reason: string }[]
  }>
}

/** Pure request-body builder (exported for tests). freeBusy accepts at most 50 items. */
export function buildFreeBusyBody(
  timeMin: string,
  timeMax: string,
  calendarIds: string[]
): { timeMin: string; timeMax: string; items: { id: string }[] } {
  return { timeMin, timeMax, items: calendarIds.slice(0, 50).map(id => ({ id })) }
}

/**
 * Pure response parser (exported for tests). Busy periods are tagged with the
 * calendar they came from; a calendar that errored or is missing from the
 * response lands in `erroredCalendarIds` instead of silently reading as free.
 */
export function parseFreeBusyResponse(
  json: FreeBusyResponse,
  requestedIds: string[]
): { busy: { start: string; end: string; calendarId: string }[]; erroredCalendarIds: string[] } {
  const busy: { start: string; end: string; calendarId: string }[] = []
  const erroredCalendarIds: string[] = []
  const calendars = json.calendars ?? {}

  for (const id of requestedIds) {
    const info = calendars[id]
    if (!info) {
      erroredCalendarIds.push(id)
      continue
    }
    if (info.errors && info.errors.length > 0) erroredCalendarIds.push(id)
    for (const b of info.busy ?? []) busy.push({ start: b.start, end: b.end, calendarId: id })
  }

  return { busy, erroredCalendarIds }
}

/**
 * What a freeBusy lookup can actually tell us.
 *
 * The third value is the point of this type. `checkCalendarConflicts` used to
 * return a plain array, and a revoked refresh token, a 403, a network failure
 * and a genuinely empty calendar all produced the same empty array — so
 * "Google says this teacher is free" and "we could not ask Google" were
 * indistinguishable to every caller. Nothing may treat UNKNOWN as free without
 * saying so.
 */
export type CalendarCheckStatus = 'free' | 'busy' | 'unknown_provider_error'

export interface CalendarFreeBusyResult {
  status: CalendarCheckStatus
  conflicts: CalendarConflict[]
  /** Which connected level could not be answered at all. */
  unreachable: ('org' | 'teacher')[]
  /** Calendars the response itself reported an error for, or omitted. */
  erroredCalendarIds: string[]
}

async function fetchBusyPeriods(
  encryptedRefreshToken: string,
  timeMin: string,
  timeMax: string,
  calendars: SelectedCalendar[]
): Promise<{
  busy: { start: string; end: string; label: string | null }[]
  erroredCalendarIds: string[]
}> {
  const accessToken = await getAccessToken(encryptedRefreshToken)
  const ids = calendars.map(c => c.id)

  const res = await fetchWithTimeout(GOOGLE_FREEBUSY_URL, {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildFreeBusyBody(timeMin, timeMax, ids)),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`[google-calendar] FreeBusy request failed ${res.status}: ${body}`)
  }

  const { busy, erroredCalendarIds } = parseFreeBusyResponse(
    await res.json() as FreeBusyResponse,
    ids
  )
  if (erroredCalendarIds.length > 0) {
    console.error('[google-calendar] FreeBusy per-calendar errors', { erroredCalendarIds })
  }

  const summaryById = new Map(calendars.map(c => [c.id, c.summary]))
  return {
    busy: busy.map(b => ({
      start: b.start,
      end:   b.end,
      label: summaryById.get(b.calendarId) ?? null,
    })),
    // Computed here since Sprint 29 and then only logged. It is now carried to
    // the caller, which is what makes an unanswerable calendar visible.
    erroredCalendarIds,
  }
}

/**
 * Checks both the org calendar and the teacher calendar for busy periods
 * overlapping [timeMin, timeMax].
 *
 * Still never throws — a Google outage must not crash a Server Action — but it
 * no longer lies about what it found. A level that threw, and a calendar the
 * response reported an error for, both make the result
 * `unknown_provider_error`, and it is the caller's job to decide what that
 * means for its audience: the parent booking write path fails closed, the
 * staff dialog asks for an explicit acknowledgement. Before this, a revoked
 * refresh token was reported to every caller as "free".
 */
export async function checkCalendarConflicts(params: {
  orgEncryptedToken:        string | null
  teacherEncryptedToken:    string | null
  orgSelectedCalendars:     SelectedCalendar[]
  teacherSelectedCalendars: SelectedCalendar[]
  timeMin:                  string  // ISO 8601
  timeMax:                  string  // ISO 8601
}): Promise<CalendarFreeBusyResult> {
  const {
    orgEncryptedToken, teacherEncryptedToken,
    orgSelectedCalendars, teacherSelectedCalendars,
    timeMin, timeMax,
  } = params

  const conflicts: CalendarConflict[] = []
  const unreachable: ('org' | 'teacher')[] = []
  const erroredCalendarIds: string[] = []

  const levels: { calendar: 'org' | 'teacher'; token: string | null; calendars: SelectedCalendar[] }[] = [
    { calendar: 'org', token: orgEncryptedToken, calendars: orgSelectedCalendars },
    { calendar: 'teacher', token: teacherEncryptedToken, calendars: teacherSelectedCalendars },
  ]

  for (const level of levels) {
    if (!level.token) continue
    try {
      const result = await fetchBusyPeriods(level.token, timeMin, timeMax, level.calendars)
      conflicts.push(...result.busy.map(b => ({ ...b, calendar: level.calendar })))
      erroredCalendarIds.push(...result.erroredCalendarIds)
    } catch (err) {
      // A revoked token, a 403, a network failure and the 8s timeout all land
      // here, and all of them mean "we do not know", not "nothing is booked".
      console.error(`[google-calendar] ${level.calendar} freebusy check failed`, { err })
      unreachable.push(level.calendar)
    }
  }

  const degraded = unreachable.length > 0 || erroredCalendarIds.length > 0

  // A conflict we *did* find is already the cautious answer, so it outranks the
  // partial failure: reporting 'busy' blocks or warns, which is the safe side.
  const status: CalendarCheckStatus =
    conflicts.length > 0 ? 'busy' : degraded ? 'unknown_provider_error' : 'free'

  return { status, conflicts, unreachable, erroredCalendarIds }
}
