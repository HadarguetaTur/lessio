import { createClient } from '@/lib/supabase/server'

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
  created_at: string
}

export interface GetParentsOptions {
  search?: string
}

export async function getParents(
  organizationId: string,
  options: GetParentsOptions = {}
): Promise<Parent[]> {
  const supabase = await createClient()

  let query = supabase
    .from('parents')
    .select(
      'id, full_name, phone, email, second_phone, address, relation_type, notes, is_active, created_at'
    )
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
  const supabase = await createClient()

  const { data } = await supabase
    .from('parents')
    .select(
      'id, full_name, phone, email, second_phone, address, relation_type, notes, is_active, created_at'
    )
    .eq('id', id)
    .eq('organization_id', organizationId)
    .single()

  return data ?? null
}
