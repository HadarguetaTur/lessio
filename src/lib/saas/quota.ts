import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getEffectiveSaasPlan } from '@/lib/saas/subscriptions'
import type { SaasPlanRow } from '@/lib/saas/plans'

/**
 * The dimensions a plan can cap. `teachers` is the value metric — the others
 * are generous ceilings that only the trial and the retired tiers still hit.
 */
export type QuotaKind = 'students' | 'lessons_monthly' | 'teachers'

export class QuotaExceededError extends Error {
  constructor(
    public kind: QuotaKind,
    public limit: number
  ) {
    super(`QUOTA_EXCEEDED:${kind}`)
    this.name = 'QuotaExceededError'
  }
}

type ServiceClient = ReturnType<typeof createServiceRoleClient>

/**
 * One spec per dimension, keyed as a full Record so a new QuotaKind cannot
 * compile without one.
 *
 * This replaced an `if (kind === 'students') … else …`, where the else branch
 * was implicitly "lessons". A third kind would have fallen into it silently and
 * enforced the wrong limit against the wrong table.
 *
 * Counts here match the `organization_usage` view (see the platform admin
 * console migration) rather than counting raw rows. The two used to disagree:
 * an org that archived 30 students showed 80/100 in the admin queue and was
 * blocked at 100 by enforcement.
 */
const QUOTA_SPECS: Record<
  QuotaKind,
  {
    limitOf: (plan: SaasPlanRow) => number | null
    count: (db: ServiceClient, orgId: string) => Promise<{ count: number | null; error: { message: string } | null }>
  }
> = {
  students: {
    limitOf: (plan) => plan.students_quota,
    count: async (db, orgId) =>
      db
        .from('students')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .not('is_active', 'is', false),
  },
  lessons_monthly: {
    limitOf: (plan) => plan.lessons_monthly_quota,
    count: async (db, orgId) =>
      db
        .from('lessons')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .neq('status', 'cancelled')
        .gte('start_at', currentMonthStart())
        .lt('start_at', nextMonthStart()),
  },
  teachers: {
    limitOf: (plan) => plan.teachers_quota,
    // `.not(is_active, is, false)` rather than `.eq(true)`: reads as "not
    // archived" and stays correct on both sides of the NOT NULL migration.
    count: async (db, orgId) =>
      db
        .from('teachers')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .not('is_active', 'is', false),
  },
}

/**
 * Throws QuotaExceededError if adding `additionalCount` items would exceed
 * the org's plan quota for the given kind. No-op for grandfathered orgs
 * (no subscription) or plans with null (unlimited) quotas.
 *
 * Reads the EFFECTIVE plan, so an active trial is measured against the tier the
 * trial grants — not against the `free` row it technically sits on.
 */
export async function requireQuotaCapacity(
  orgId: string,
  kind: QuotaKind,
  additionalCount?: number
): Promise<void> {
  const plan = await getEffectiveSaasPlan(orgId)
  if (!plan) return // grandfathered org — no quota enforcement

  const spec = QUOTA_SPECS[kind]
  const limit = spec.limitOf(plan)
  if (limit == null) return // unlimited

  const db = createServiceRoleClient()
  const { count, error } = await spec.count(db, orgId)
  if (error) throw new Error(`Quota check failed: ${error.message}`)

  const add = additionalCount ?? 1
  if ((count ?? 0) + add > limit) {
    throw new QuotaExceededError(kind, limit)
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
  teachersUsed: number
  teachersLimit: number | null
}> {
  const plan = await getEffectiveSaasPlan(orgId)
  const db = createServiceRoleClient()

  const [students, lessons, teachers] = await Promise.all([
    QUOTA_SPECS.students.count(db, orgId),
    QUOTA_SPECS.lessons_monthly.count(db, orgId),
    QUOTA_SPECS.teachers.count(db, orgId),
  ])

  return {
    studentsUsed: students.count ?? 0,
    studentsLimit: plan ? plan.students_quota : null,
    lessonsUsed: lessons.count ?? 0,
    lessonsLimit: plan ? plan.lessons_monthly_quota : null,
    teachersUsed: teachers.count ?? 0,
    teachersLimit: plan ? plan.teachers_quota : null,
  }
}

export type OrgQuotaUsage = Awaited<ReturnType<typeof getOrgQuotaUsage>>

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
