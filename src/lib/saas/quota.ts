import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getOrgSubscriptionState } from '@/lib/saas/subscriptions'
import { getSaasPlanById } from '@/lib/saas/plans'

export class QuotaExceededError extends Error {
  constructor(
    public kind: 'students' | 'lessons_monthly',
    public limit: number
  ) {
    super(`QUOTA_EXCEEDED:${kind}`)
    this.name = 'QuotaExceededError'
  }
}

/**
 * Throws QuotaExceededError if adding `additionalCount` items would exceed
 * the org's plan quota for the given kind. No-op for grandfathered orgs
 * (no subscription) or plans with null (unlimited) quotas.
 */
export async function requireQuotaCapacity(
  orgId: string,
  kind: 'students' | 'lessons_monthly',
  additionalCount?: number
): Promise<void> {
  const state = await getOrgSubscriptionState(orgId)
  if (!state) return // grandfathered org — no quota enforcement

  const plan = await getSaasPlanById(state.planId)
  if (!plan) return

  const db = createServiceRoleClient()
  const add = additionalCount ?? 1

  if (kind === 'students') {
    const limit = (plan as Record<string, unknown>).students_quota as number | null
    if (limit == null) return

    const { count, error } = await db
      .from('students')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId)

    if (error) throw new Error(`Quota check failed: ${error.message}`)

    if ((count ?? 0) + add > limit) {
      throw new QuotaExceededError('students', limit)
    }
  } else {
    // lessons_monthly
    const limit = (plan as Record<string, unknown>).lessons_monthly_quota as number | null
    if (limit == null) return

    const { count, error } = await db
      .from('lessons')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .gte('start_at', `${currentMonthStart()}`)
      .lt('start_at', `${nextMonthStart()}`)

    if (error) throw new Error(`Quota check failed: ${error.message}`)

    if ((count ?? 0) + add > limit) {
      throw new QuotaExceededError('lessons_monthly', limit)
    }
  }
}

/**
 * Returns current usage counts and plan limits for UI display.
 */
export async function getOrgQuotaUsage(orgId: string): Promise<{
  studentsUsed: number
  studentsLimit: number | null
  lessonsUsed: number
  lessonsLimit: number | null
}> {
  const state = await getOrgSubscriptionState(orgId)

  let studentsLimit: number | null = null
  let lessonsLimit: number | null = null

  if (state) {
    const plan = await getSaasPlanById(state.planId)
    if (plan) {
      studentsLimit = (plan as Record<string, unknown>).students_quota as number | null
      lessonsLimit = (plan as Record<string, unknown>).lessons_monthly_quota as number | null
    }
  }

  const db = createServiceRoleClient()

  const [studentsRes, lessonsRes] = await Promise.all([
    db
      .from('students')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId),
    db
      .from('lessons')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .gte('start_at', `${currentMonthStart()}`)
      .lt('start_at', `${nextMonthStart()}`),
  ])

  return {
    studentsUsed: studentsRes.count ?? 0,
    studentsLimit,
    lessonsUsed: lessonsRes.count ?? 0,
    lessonsLimit,
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

/** ISO timestamp for the start of the current UTC month */
function currentMonthStart(): string {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
}

/** ISO timestamp for the start of next UTC month */
function nextMonthStart(): string {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString()
}
