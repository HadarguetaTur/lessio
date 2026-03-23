/**
 * Lead management utilities.
 * Per /docs/sprint-4-scope.md § Lead Flow — Rules.
 *
 * Caller is responsible for calling normalizePhone() before passing phone.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createClient } from '@/lib/supabase/server'

export type LeadStatus = 'new' | 'contacted' | 'converted' | 'irrelevant'

export interface Lead {
  id: string
  phone: string
  status: LeadStatus
  raw_message: string
  notes: string | null
  created_at: string
  updated_at: string
}

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

export async function getLeads(
  orgId: string,
  options?: { status?: LeadStatus }
): Promise<Lead[]> {
  const db = await createClient()

  let query = db
    .from('leads')
    .select('id, phone, status, raw_message, notes, created_at, updated_at')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })

  if (options?.status) {
    query = query.eq('status', options.status)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`[getLeads] Failed to fetch leads: ${error.message}`)
  }

  return data as Lead[]
}

export async function updateLeadStatus(
  leadId: string,
  orgId: string,
  status: LeadStatus
): Promise<void> {
  if (status === 'converted') {
    throw new Error('[updateLeadStatus] Cannot manually set status to converted')
  }

  const db = await createClient()

  const { error } = await db
    .from('leads')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', leadId)
    .eq('organization_id', orgId)

  if (error) {
    throw new Error(`[updateLeadStatus] Failed to update lead status: ${error.message}`)
  }
}

export async function updateLeadNotes(
  leadId: string,
  orgId: string,
  notes: string
): Promise<void> {
  const db = await createClient()

  const { error } = await db
    .from('leads')
    .update({ notes, updated_at: new Date().toISOString() })
    .eq('id', leadId)
    .eq('organization_id', orgId)

  if (error) {
    throw new Error(`[updateLeadNotes] Failed to update lead notes: ${error.message}`)
  }
}

export async function getLeadById(leadId: string, orgId: string): Promise<Lead | null> {
  const db = await createClient()

  const { data } = await db
    .from('leads')
    .select('id, phone, status, raw_message, notes, created_at, updated_at')
    .eq('id', leadId)
    .eq('organization_id', orgId)
    .single()

  return data as Lead | null
}
