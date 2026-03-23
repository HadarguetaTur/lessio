import { createClient } from '@/lib/supabase/server'

export interface ConvertLeadInput {
  parentFullName: string
  studentFullName: string
  grade?: string
}

export async function convertLead(
  leadId: string,
  orgId: string,
  input: ConvertLeadInput
): Promise<{ parentId: string; studentId: string }> {
  const db = await createClient()
  const { data, error } = await db.rpc('convert_lead', {
    p_lead_id: leadId,
    p_org_id: orgId,
    p_parent_full_name: input.parentFullName,
    p_student_full_name: input.studentFullName,
    p_grade: input.grade ?? null,
  })

  if (error) {
    if (error.message === 'lead_not_found') {
      throw new Error('[convertLead] Lead not found')
    }
    if (error.message === 'lead_already_converted') {
      throw new Error('[convertLead] Lead is already converted')
    }
    if (error.message === 'phone_already_parent') {
      throw new Error('[convertLead] Phone already exists as a parent')
    }

    throw new Error(`[convertLead] Failed to convert lead: ${error.message}`)
  }

  const row = Array.isArray(data) ? data[0] : data
  if (!row?.parent_id || !row?.student_id) {
    throw new Error('[convertLead] Failed to convert lead: missing return payload')
  }

  return { parentId: row.parent_id, studentId: row.student_id }
}
