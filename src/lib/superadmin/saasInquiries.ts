import { createServiceRoleClient } from '@/lib/supabase/service-role'

export type SaasInquiryListItem = {
  id: string
  organization_id: string
  organization_name: string
  contact_name: string
  phone: string
  message: string | null
  created_at: string
}

export async function listOpenSaasInquiries(): Promise<SaasInquiryListItem[]> {
  const db = createServiceRoleClient()
  const { data: rows, error } = await db
    .from('saas_plan_inquiries')
    .select('id, organization_id, contact_name, phone, message, created_at')
    .eq('status', 'open')
    .order('created_at', { ascending: false })

  if (error || !rows?.length) return []

  const orgIds = [...new Set(rows.map((r) => r.organization_id))]
  const { data: orgs } = await db.from('organizations').select('id, name').in('id', orgIds)
  const nameById = new Map((orgs ?? []).map((o) => [o.id, o.name]))

  return rows.map((r) => ({
    id: r.id,
    organization_id: r.organization_id,
    organization_name: nameById.get(r.organization_id) ?? r.organization_id,
    contact_name: r.contact_name,
    phone: r.phone,
    message: r.message,
    created_at: r.created_at,
  }))
}
