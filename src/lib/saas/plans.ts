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
}

/**
 * One source of truth for the column list. The quota columns were added a sprint
 * after this file was written and were missing from every select, which made
 * both quota limits read back as undefined — and `undefined == null` meant
 * requireQuotaCapacity treated every plan as unlimited and enforced nothing.
 */
const PLAN_COLUMNS =
  'id, name, display_name_he, display_name_en, price_monthly, price_yearly, features, sort_order, students_quota, lessons_monthly_quota'

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
  }
}

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
