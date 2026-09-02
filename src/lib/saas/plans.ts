import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { SaasPlanName } from './types'
import { parseSaasFeatures, type SaasFeatures } from './types'

export type SaasPlanRow = {
  id: string
  name: SaasPlanName
  display_name_he: string
  display_name_en: string
  price_monthly: number
  price_yearly: number | null
  features: SaasFeatures
  sort_order: number
  /** null = unlimited. Read by requireQuotaCapacity in ./quota.ts. */
  students_quota: number | null
  /** null = unlimited. Read by requireQuotaCapacity in ./quota.ts. */
  lessons_monthly_quota: number | null
  /** null = unlimited. Read by requireQuotaCapacity in ./quota.ts. */
  teachers_quota: number | null
}

/**
 * One source of truth for the column list. The quota columns were added a sprint
 * after this file was written and were missing from every select, which made
 * both quota limits read back as undefined — and `undefined == null` meant
 * requireQuotaCapacity treated every plan as unlimited and enforced nothing.
 */
const PLAN_COLUMNS =
  'id, name, display_name_he, display_name_en, price_monthly, price_yearly, features, sort_order, students_quota, lessons_monthly_quota, teachers_quota'

type PlanQueryRow = {
  id: string
  name: string
  display_name_he: string
  display_name_en: string
  price_monthly: number | string
  price_yearly: number | string | null
  features: unknown
  sort_order: number
  students_quota: number | null
  lessons_monthly_quota: number | null
  teachers_quota: number | null
}

function mapPlanRow(row: PlanQueryRow): SaasPlanRow {
  return {
    id: row.id,
    name: row.name as SaasPlanName,
    display_name_he: row.display_name_he,
    display_name_en: row.display_name_en,
    price_monthly: Number(row.price_monthly),
    price_yearly: row.price_yearly != null ? Number(row.price_yearly) : null,
    features: parseSaasFeatures(row.features),
    sort_order: row.sort_order,
    students_quota: row.students_quota != null ? Number(row.students_quota) : null,
    lessons_monthly_quota:
      row.lessons_monthly_quota != null ? Number(row.lessons_monthly_quota) : null,
    teachers_quota: row.teachers_quota != null ? Number(row.teachers_quota) : null,
  }
}

/**
 * The catalog a tenant may buy from. Retired tiers are excluded.
 *
 * Use this ONLY for pickers and pricing tables. Anything that has to describe a
 * plan an org already holds — admin lists, quota-pressure queues, plan
 * dropdowns — must use listAllSaasPlans(), or grandfathered orgs silently read
 * back as "plan unknown / unlimited".
 */
export async function listActiveSaasPlans(): Promise<SaasPlanRow[]> {
  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('saas_plans')
    .select(PLAN_COLUMNS)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (error || !data) return []

  return (data as unknown as PlanQueryRow[]).map(mapPlanRow)
}

/** Every plan row, retired ones included. See listActiveSaasPlans for when to use which. */
export async function listAllSaasPlans(): Promise<SaasPlanRow[]> {
  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('saas_plans')
    .select(PLAN_COLUMNS)
    .order('sort_order', { ascending: true })

  if (error || !data) return []

  return (data as unknown as PlanQueryRow[]).map(mapPlanRow)
}

/**
 * Look up a plan the app intends to SELL. Filters `is_active` on purpose: a
 * retired tier must never come back through a name lookup.
 *
 * Note the failure mode is silent — a caller whose plan name no longer resolves
 * gets `null`, and at least one caller (the trial entitlement in
 * subscriptions.ts) treats null as "grant everything". Never point this at a
 * name that a migration might retire; use TRIAL_ENTITLEMENT_PLAN.
 */
export async function getSaasPlanByName(name: SaasPlanName): Promise<SaasPlanRow | null> {
  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('saas_plans')
    .select(PLAN_COLUMNS)
    .eq('name', name)
    .eq('is_active', true)
    .maybeSingle()

  if (error || !data) return null

  return mapPlanRow(data as unknown as PlanQueryRow)
}

/**
 * Look up the plan an org ALREADY HOLDS.
 *
 * ⚠️ The absence of an `is_active` filter here is deliberate and load-bearing.
 * `organization_subscriptions` has no price column — every price, feature and
 * quota is resolved live through this function. Because it ignores is_active,
 * an org whose plan row was retired keeps resolving the price it bought,
 * forever. That is the entire grandfathering mechanism, and the convention it
 * enables: a price change creates a NEW row and retires the old one, never
 * edits a row in place.
 *
 * Adding `.eq('is_active', true)` here would re-price every legacy customer at
 * their next checkout and blank their features. plans.test.ts asserts this
 * filter stays absent — if that test fails, read this comment before "fixing"
 * it.
 */
export async function getSaasPlanById(id: string): Promise<SaasPlanRow | null> {
  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('saas_plans')
    .select(PLAN_COLUMNS)
    .eq('id', id)
    .maybeSingle()

  if (error || !data) return null

  return mapPlanRow(data as unknown as PlanQueryRow)
}
