/**
 * Records that Google refused a stored refresh token (`invalid_grant`), so the
 * connection reads as "needs re-authorisation" everywhere: the settings pages
 * show a reconnect prompt instead of a green tick, and the conflict checkers
 * stop asking Google for that level until the OAuth callback clears the flag.
 *
 * Fire-and-forget by design — it runs inside a lesson-creation action and a
 * parent booking, and a failed bookkeeping write must not change their answer.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { CalendarFreeBusyResult } from './index'

export function markCalendarConnectionsRevoked(params: {
  orgId: string
  teacherId: string
  revoked: CalendarFreeBusyResult['revoked'] | undefined
}): void {
  const { orgId, teacherId } = params
  // Tolerates a partial result (test doubles stub checkCalendarConflicts).
  const revoked = params.revoked ?? []
  if (revoked.length === 0) return

  const db = createServiceRoleClient()
  const now = new Date().toISOString()

  for (const level of revoked) {
    const query = level === 'org'
      ? db.from('organizations').update({ google_calendar_needs_reauth_at: now }).eq('id', orgId)
      : db.from('teachers').update({ google_calendar_needs_reauth_at: now }).eq('id', teacherId)

    void query.then(({ error }) => {
      if (error) {
        console.error('[google-calendar] Could not flag the revoked connection', { level, orgId, teacherId, error })
      } else {
        console.warn('[google-calendar] Refresh token revoked; connection flagged for re-auth', { level, orgId, teacherId })
      }
    })
  }
}
