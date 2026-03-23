import { createClient } from '@/lib/supabase/server'

export interface Student {
  id: string
  full_name: string
  grade: string | null
  notes: string | null
  is_active: boolean
  created_at: string
}

export interface GetStudentsOptions {
  search?: string
  /** undefined = active only, true = active only, false = inactive only */
  isActive?: boolean
}

export async function getStudents(
  organizationId: string,
  options: GetStudentsOptions = {}
): Promise<Student[]> {
  const supabase = await createClient()

  let query = supabase
    .from('students')
    .select('id, full_name, grade, notes, is_active, created_at')
    .eq('organization_id', organizationId)
    .order('full_name', { ascending: true })

  const activeFilter = options.isActive ?? true
  query = query.eq('is_active', activeFilter)

  if (options.search) {
    query = query.ilike('full_name', `%${options.search}%`)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function getStudentById(
  id: string,
  organizationId: string
): Promise<Student | null> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('students')
    .select('id, full_name, grade, notes, is_active, created_at')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .single()

  return data ?? null
}
