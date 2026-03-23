/**
 * Lead management utilities.
 * Per /docs/sprint-4-scope.md § Lead Flow — Rules.
 *
 * Caller is responsible for calling normalizePhone() before passing phone.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'

export type LeadStatus = 'new' | 'contacted' | 'converted' | 'irrelevant'

/**
 * Insert a new lead, or if one already exists for (organization_id, phone),
 * update updated_at only — preserving status, notes, and raw_message.
 */
export async function upsertLead(
  organizationId: string,
  phone: string,
  rawMessage: string
): Promise<void> {
  const db = createServiceRoleClient()

  const { error: insertError } = await db
    .from('leads')
    .insert({ organization_id: organizationId, phone, raw_message: rawMessage })

  if (!insertError) return

  if (insertError.code === '23505') {
    // Lead already exists — update updated_at only, preserve all other fields
    const { error: updateError } = await db
      .from('leads')
      .update({ updated_at: new Date().toISOString() })
      .eq('organization_id', organizationId)
      .eq('phone', phone)

    if (updateError) {
      throw new Error(`[upsertLead] Failed to update lead updated_at: ${updateError.message}`)
    }
    return
  }

  throw new Error(`[upsertLead] Failed to insert lead: ${insertError.message}`)
}
