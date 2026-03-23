import { createServiceRoleClient } from '@/lib/supabase/service-role'

export class MissingPrimaryParentError extends Error {
  constructor(studentId: string) {
    super(`No primary parent found for student ${studentId}`)
    this.name = 'MissingPrimaryParentError'
  }
}

interface Relationship {
  parent_id: string
  is_primary: boolean
}

/**
 * Pure function — picks the primary parent_id from a pre-fetched list.
 * Throws MissingPrimaryParentError if none is marked is_primary = true.
 */
export function pickPrimaryParent(relationships: Relationship[], studentId: string): string {
  const primary = relationships.find((r) => r.is_primary)
  if (!primary) throw new MissingPrimaryParentError(studentId)
  return primary.parent_id
}

/**
 * Resolves the billing parent for a student.
 * Uses service role to bypass RLS (called from server-side charge engine only).
 * Throws MissingPrimaryParentError if no primary parent exists.
 */
export async function resolveBillingParent(
  studentId: string,
  organizationId: string
): Promise<string> {
  const supabase = createServiceRoleClient()

  const { data, error } = await supabase
    .from('relationships')
    .select('parent_id, is_primary')
    .eq('student_id', studentId)
    .eq('organization_id', organizationId)

  if (error) throw new Error(`Failed to fetch relationships: ${error.message}`)

  return pickPrimaryParent(data ?? [], studentId)
}
