/**
 * The numbers the admin sidebar badges.
 * Server-only; runs on every admin page load, so every query is a head count.
 *
 * Per /docs/sprint-34-scope.md § מבנה המידע החדש. countOpenTickets() and
 * countOpenDevIssues() have existed since Sprint 32 and were exported but never
 * rendered anywhere — this is what finally consumes them.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { AdminNavCounts } from '@/components/admin/AdminSidebar'
import { countOpenDevIssues } from './devIssues'
import { countOpenTickets } from './supportTickets'

async function countPastDue(): Promise<number> {
  const db = createServiceRoleClient()
  const { count, error } = await db
    .from('organization_subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'past_due')

  if (error) {
    console.error('[superadmin/navCounts] past_due count failed', error.message)
    return 0
  }
  return count ?? 0
}

/** Never rejects: a failed count must not blank the whole admin shell. */
export async function getAdminNavCounts(): Promise<AdminNavCounts> {
  const [support, devIssues, pastDue] = await Promise.all([
    countOpenTickets().catch(() => 0),
    countOpenDevIssues().catch(() => 0),
    countPastDue().catch(() => 0),
  ])

  return { support, devIssues, pastDue }
}
