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

const GOOGLE_TOKEN_URL    = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo'
const GOOGLE_FREEBUSY_URL = 'https://www.googleapis.com/calendar/v3/freeBusy'

export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'

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
}

export async function exchangeCalendarCode(code: string): Promise<CalendarTokens> {
  const clientId     = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('[google-calendar] GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is not set')
  }

  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
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
    error?:         string
  }

  if (!tokenJson.access_token || !tokenJson.refresh_token) {
    throw new Error(`[google-calendar] Token exchange: missing tokens — ${JSON.stringify(tokenJson)}`)
  }

  const userRes = await fetch(GOOGLE_USERINFO_URL, {
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

  const res = await fetch(GOOGLE_TOKEN_URL, {
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

// ── FreeBusy ─────────────────────────────────────────────────────────────────

export interface CalendarConflict {
  start:    string
  end:      string
  calendar: 'org' | 'teacher'
}

interface FreeBusyResponse {
  calendars?: {
    primary?: {
      busy?: { start: string; end: string }[]
      errors?: { domain: string; reason: string }[]
    }
  }
}

async function fetchBusyPeriods(
  encryptedRefreshToken: string,
  timeMin: string,
  timeMax: string
): Promise<{ start: string; end: string }[]> {
  const accessToken = await getAccessToken(encryptedRefreshToken)

  const res = await fetch(GOOGLE_FREEBUSY_URL, {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      timeMin,
      timeMax,
      items: [{ id: 'primary' }],
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`[google-calendar] FreeBusy request failed ${res.status}: ${body}`)
  }

  const json = await res.json() as FreeBusyResponse
  return json.calendars?.primary?.busy ?? []
}

/**
 * Checks both the org calendar and the teacher calendar for busy periods
 * overlapping [timeMin, timeMax].
 *
 * Returns an empty array if neither calendar is connected or no conflicts found.
 * Never throws — errors are logged and treated as no-conflict so lesson creation
 * is never blocked by a transient Google API failure.
 */
export async function checkCalendarConflicts(params: {
  orgEncryptedToken:     string | null
  teacherEncryptedToken: string | null
  timeMin:               string  // ISO 8601
  timeMax:               string  // ISO 8601
}): Promise<CalendarConflict[]> {
  const { orgEncryptedToken, teacherEncryptedToken, timeMin, timeMax } = params
  const conflicts: CalendarConflict[] = []

  if (orgEncryptedToken) {
    try {
      const busy = await fetchBusyPeriods(orgEncryptedToken, timeMin, timeMax)
      conflicts.push(...busy.map(b => ({ ...b, calendar: 'org' as const })))
    } catch (err) {
      console.error('[google-calendar] Org freebusy check failed', { err })
    }
  }

  if (teacherEncryptedToken) {
    try {
      const busy = await fetchBusyPeriods(teacherEncryptedToken, timeMin, timeMax)
      conflicts.push(...busy.map(b => ({ ...b, calendar: 'teacher' as const })))
    } catch (err) {
      console.error('[google-calendar] Teacher freebusy check failed', { err })
    }
  }

  return conflicts
}
