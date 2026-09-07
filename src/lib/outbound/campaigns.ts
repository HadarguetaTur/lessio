/**
 * Campaigns: the cold email copy. Service role, superadmin shell only.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { Campaign, OutboundLocale } from './types'

export async function listCampaigns(): Promise<Campaign[]> {
  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('outbound_campaigns')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw new Error(`[outbound/campaigns] list failed: ${error.message}`)
  return (data ?? []) as Campaign[]
}

export async function saveCampaign(input: {
  id?: string
  name: string
  subject: string
  bodyText: string
  locale: OutboundLocale
  isActive: boolean
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const db = createServiceRoleClient()
  const row = {
    name: input.name,
    subject: input.subject,
    body_text: input.bodyText,
    locale: input.locale,
    is_active: input.isActive,
  }
  if (input.id) {
    const { data, error } = await db
      .from('outbound_campaigns')
      .update(row)
      .eq('id', input.id)
      .select('id')
      .maybeSingle()
    if (error) return { ok: false, error: 'SAVE_FAILED' }
    if (!data) return { ok: false, error: 'NOT_FOUND' }
    return { ok: true, id: data.id as string }
  }
  const { data, error } = await db.from('outbound_campaigns').insert(row).select('id').single()
  if (error || !data) return { ok: false, error: 'SAVE_FAILED' }
  return { ok: true, id: data.id as string }
}
