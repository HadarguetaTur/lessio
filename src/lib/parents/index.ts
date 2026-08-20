import { createServiceRoleClient } from '@/lib/supabase/service-role'

export interface Parent {
  id: string
  full_name: string
  phone: string
  email: string | null
  second_phone: string | null
  address: string | null
  relation_type: string | null
  notes: string | null
  is_active: boolean
  /** Set when the parent replied STOP on WhatsApp — blocks business-initiated sends. */
  opted_out_at: string | null
  /** How consent to WhatsApp messaging was obtained; null = no evidence on file. */
  consent_source: ConsentSource | null
  consented_at: string | null
  /** When the one-time welcome notice went out; null = next business send is preceded by it. */
  welcome_sent_at: string | null
  created_at: string
}

export type ConsentSource = 'attested' | 'import' | 'portal' | 'booking' | 'whatsapp_reply'

const PARENT_COLUMNS =
  'id, full_name, phone, email, second_phone, address, relation_type, notes, is_active, opted_out_at, consent_source, consented_at, welcome_sent_at, created_at'

export interface GetParentsOptions {
  search?: string
}

export async function getParents(
  organizationId: string,
  options: GetParentsOptions = {}
): Promise<Parent[]> {
  const supabase = createServiceRoleClient()

  let query = supabase
    .from('parents')
    .select(PARENT_COLUMNS)
    .eq('organization_id', organizationId)
    .order('full_name', { ascending: true })

  if (options.search) {
    // Search by name or phone
    query = query.or(
      `full_name.ilike.%${options.search}%,phone.ilike.%${options.search}%`
    )
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function getParentById(
  id: string,
  organizationId: string
): Promise<Parent | null> {
  const supabase = createServiceRoleClient()

  const { data } = await supabase
    .from('parents')
    .select(PARENT_COLUMNS)
    .eq('id', id)
    .eq('organization_id', organizationId)
    .single()

  return data ?? null
}
