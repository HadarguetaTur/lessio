/**
 * The numbers the admin sidebar badges.
 * Server-only; runs on every admin page load, so every query is a head count.
 *
 * Per /docs/sprint-34-scope.md § A. countOpenTickets() and countOpenDevIssues()
 * have existed since Sprint 32 and were exported but never rendered anywhere —
 * this is what finally consumes them.
 *
 * Counts are gated by capability: a badge is a claim about work waiting for
 * *you*, so showing a billing colleague the support queue's backlog would be
 * both noise and a small leak about a section they cannot open.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { AdminNavCounts } from '@/components/admin/AdminSidebar'
import type { PlatformCapability } from './capabilities'
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
export async function getAdminNavCounts(
  capabilities: readonly PlatformCapability[]
): Promise<AdminNavCounts> {
  const canSupport = capabilities.includes('support.read')
  const canBilling = capabilities.includes('billing.read')

  const [support, devIssues, pastDue] = await Promise.all([
    canSupport ? countOpenTickets().catch(() => 0) : Promise.resolve(0),
    canSupport ? countOpenDevIssues().catch(() => 0) : Promise.resolve(0),
    canBilling ? countPastDue().catch(() => 0) : Promise.resolve(0),
  ])

  return { support, devIssues, pastDue }
}
