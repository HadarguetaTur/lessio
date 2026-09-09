/**
 * A tenant's data as one JSON document.
 *
 * Two callers: the "Export Data (JSON)" button in the admin shell, and the
 * pre-delete snapshot in ./deleteOrganization.ts. It lives here rather than in
 * the Server Action file so the delete path can take a snapshot without
 * importing an action.
 *
 * KNOWN LIMITATION: this is the operational core (parents, students, lessons,
 * charges) — not a full tenant backup. Homework, receipts, message history,
 * subscriptions and every stored file are NOT in it. It is enough to answer
 * "who were the students and what were they billed", which is what an operator
 * needs after an accidental delete; it is not enough to reconstitute the org.
 * Whole-database PITR remains the only complete recovery, and it rolls back
 * every other tenant with it.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'

export interface OrgDataExport {
  exported_at: string
  org_id: string
  parents: unknown[]
  students: unknown[]
  lessons: unknown[]
  charges: unknown[]
}

export async function buildOrgDataExport(orgId: string): Promise<OrgDataExport> {
  const db = createServiceRoleClient()

  const [parents, students, lessons, charges] = await Promise.all([
    db.from('parents').select('*').eq('organization_id', orgId),
    db.from('students').select('*').eq('organization_id', orgId),
    db.from('lessons').select('*').eq('organization_id', orgId),
    db.from('charges').select('*').eq('organization_id', orgId),
  ])

  return {
    exported_at: new Date().toISOString(),
    org_id: orgId,
    parents: parents.data ?? [],
    students: students.data ?? [],
    lessons: lessons.data ?? [],
    charges: charges.data ?? [],
  }
}

export function countExportedRows(payload: OrgDataExport): Record<string, number> {
  return {
    parents: payload.parents.length,
    students: payload.students.length,
    lessons: payload.lessons.length,
    charges: payload.charges.length,
  }
}
