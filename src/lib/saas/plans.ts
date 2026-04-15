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
}

export async function listActiveSaasPlans(): Promise<SaasPlanRow[]> {
  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('saas_plans')
    .select('id, name, display_name_he, display_name_en, price_monthly, price_yearly, features, sort_order')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (error || !data) return []

  return data.map((row) => ({
    id: row.id,
    name: row.name as SaasPlanName,
    display_name_he: row.display_name_he,
    display_name_en: row.display_name_en,
    price_monthly: Number(row.price_monthly),
    price_yearly: row.price_yearly != null ? Number(row.price_yearly) : null,
    features: parseSaasFeatures(row.features),
    sort_order: row.sort_order,
  }))
}

export async function getSaasPlanByName(name: SaasPlanName): Promise<SaasPlanRow | null> {
  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('saas_plans')
    .select('id, name, display_name_he, display_name_en, price_monthly, price_yearly, features, sort_order')
    .eq('name', name)
    .eq('is_active', true)
    .maybeSingle()

  if (error || !data) return null

  return {
    id: data.id,
    name: data.name as SaasPlanName,
    display_name_he: data.display_name_he,
    display_name_en: data.display_name_en,
    price_monthly: Number(data.price_monthly),
    price_yearly: data.price_yearly != null ? Number(data.price_yearly) : null,
    features: parseSaasFeatures(data.features),
    sort_order: data.sort_order,
  }
}

export async function getSaasPlanById(id: string): Promise<SaasPlanRow | null> {
  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('saas_plans')
    .select('id, name, display_name_he, display_name_en, price_monthly, price_yearly, features, sort_order')
    .eq('id', id)
    .maybeSingle()

  if (error || !data) return null

  return {
    id: data.id,
    name: data.name as SaasPlanName,
    display_name_he: data.display_name_he,
    display_name_en: data.display_name_en,
    price_monthly: Number(data.price_monthly),
    price_yearly: data.price_yearly != null ? Number(data.price_yearly) : null,
    features: parseSaasFeatures(data.features),
    sort_order: data.sort_order,
  }
}
