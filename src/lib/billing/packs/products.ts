/**
 * The punch-card catalog (decision #46). Lives on the collection-policy
 * settings page; a sale snapshots the product, so edits never reach cards
 * already sold.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'

export type CoveredLessonType = 'individual' | 'pair' | 'group' | 'custom'
export const COVERABLE_LESSON_TYPES: readonly CoveredLessonType[] = ['individual', 'pair', 'group', 'custom']

export interface PackProduct {
  id: string
  name: string
  credits: number
  price: number
  covered_lesson_types: CoveredLessonType[]
  validity_days: number | null
  is_active: boolean
  sort_order: number
}

export async function listPackProducts(
  organizationId: string,
  options: { activeOnly?: boolean } = {}
): Promise<PackProduct[]> {
  const db = createServiceRoleClient()
  let query = db
    .from('lesson_pack_products')
    .select('id, name, credits, price, covered_lesson_types, validity_days, is_active, sort_order')
    .eq('organization_id', organizationId)
  if (options.activeOnly) query = query.eq('is_active', true)
  const { data, error } = await query.order('sort_order').order('created_at')
  if (error) throw new Error(`[packs] catalog read failed: ${error.message}`)
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    ...(row as unknown as PackProduct),
    credits: Number(row.credits),
    price: Number(row.price),
    validity_days: row.validity_days == null ? null : Number(row.validity_days),
  }))
}

export interface PackProductInput {
  name: string
  credits: number
  price: number
  covered_lesson_types: CoveredLessonType[]
  validity_days: number | null
}

export async function createPackProduct(organizationId: string, input: PackProductInput): Promise<{ ok: boolean }> {
  const db = createServiceRoleClient()
  const { count } = await db
    .from('lesson_pack_products')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
  const { error } = await db.from('lesson_pack_products').insert({
    organization_id: organizationId,
    ...input,
    sort_order: count ?? 0,
  })
  if (error) console.error('[packs] product insert failed', { organizationId, error: error.message })
  return { ok: !error }
}

export async function updatePackProduct(
  organizationId: string,
  productId: string,
  patch: Partial<PackProductInput> & { is_active?: boolean }
): Promise<{ ok: boolean }> {
  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('lesson_pack_products')
    .update(patch)
    .eq('id', productId)
    .eq('organization_id', organizationId)
    .select('id')
    .maybeSingle()
  if (error) console.error('[packs] product update failed', { organizationId, productId, error: error.message })
  return { ok: !error && Boolean(data) }
}
