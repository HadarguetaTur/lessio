/**
 * Org-ownership assertions for ids that arrive from the client.
 *
 * Every mutation in this product runs on a service-role client, which bypasses
 * RLS. That makes a row id posted by a browser a bare pointer: valid-looking,
 * unguessable in practice, and completely unauthorized. The recurring bug this
 * file exists to close is
 *
 *     client-supplied id  +  service-role client  +  ownership assumed
 *
 * A hard-to-guess UUID is not authorization, and neither is a hidden button.
 * Before a service-role query touches a row named by the client, the row's
 * `organization_id` must be checked against the session's — here, once, rather
 * than re-typed as an extra `.eq()` at each of a hundred call sites where the
 * next one will forget it.
 *
 * `canAccessStudent` (./studentAccess) is the row-level twin for students,
 * where the answer also depends on the actor's role. Use that one when a
 * teacher must be held to their own roster; use these when the only question
 * is "is this row mine to touch at all?".
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'

/** Tables these helpers may be pointed at. Keeps a caller from passing a string. */
export type OrgScopedTable =
  | 'students'
  | 'teachers'
  | 'parents'
  | 'student_groups'
  | 'lessons'
  | 'homework_assignments'
  | 'charges'
  | 'subscriptions'

/**
 * Thrown by the `assert*` helpers. A stable code, not display copy: these run
 * in synchronous-ish paths that cannot await a translator, and callers decide
 * whether to surface a message or a 403.
 */
export class OrgScopeError extends Error {
  constructor(
    public readonly table: OrgScopedTable,
    public readonly ids: string[]
  ) {
    super(ORG_SCOPE_VIOLATION)
    this.name = 'OrgScopeError'
  }
}

export const ORG_SCOPE_VIOLATION = 'ORG_SCOPE_VIOLATION'

/**
 * True when every id exists in `table` AND carries `organization_id = orgId`.
 *
 * Duplicates in `ids` are collapsed first, so the row count can be compared
 * against the id count directly. An empty list is vacuously true — a caller
 * that must reject "nothing selected" should say so itself, because "no ids"
 * is a validation failure, not an authorization one.
 */
export async function idsBelongToOrg(
  table: OrgScopedTable,
  ids: readonly string[],
  orgId: string
): Promise<boolean> {
  const unique = [...new Set(ids.filter(Boolean))]
  if (unique.length === 0) return true

  const db = createServiceRoleClient()
  const { data, error } = await db
    .from(table)
    .select('id')
    .eq('organization_id', orgId)
    .in('id', unique)

  // A failed query is not proof of ownership. Fail closed: the alternative is
  // a transient DB blip reading as "yes, that row is yours".
  if (error) return false
  return (data?.length ?? 0) === unique.length
}

/** {@link idsBelongToOrg} for a single id. */
export async function belongsToOrg(
  table: OrgScopedTable,
  id: string,
  orgId: string
): Promise<boolean> {
  if (!id) return false
  return idsBelongToOrg(table, [id], orgId)
}

/** Throwing twin of {@link idsBelongToOrg}. */
export async function assertIdsBelongToOrg(
  table: OrgScopedTable,
  ids: readonly string[],
  orgId: string
): Promise<void> {
  if (!(await idsBelongToOrg(table, ids, orgId))) {
    throw new OrgScopeError(table, [...ids])
  }
}

/** Throwing twin of {@link belongsToOrg}. */
export async function assertBelongsToOrg(
  table: OrgScopedTable,
  id: string,
  orgId: string
): Promise<void> {
  if (!(await belongsToOrg(table, id, orgId))) {
    throw new OrgScopeError(table, [id])
  }
}

/**
 * The named wrappers below exist so a call site reads as the thing it is
 * protecting. They are one line each on purpose: the moment a caller writes
 * `.eq('organization_id', ...)` inline instead, the next caller copies the
 * version that forgot it.
 */

export const assertGroupBelongsToOrg = (groupId: string, orgId: string) =>
  assertBelongsToOrg('student_groups', groupId, orgId)

export const assertTeacherBelongsToOrg = (teacherId: string, orgId: string) =>
  assertBelongsToOrg('teachers', teacherId, orgId)

export const assertStudentsBelongToOrg = (studentIds: readonly string[], orgId: string) =>
  assertIdsBelongToOrg('students', studentIds, orgId)

export const groupBelongsToOrg = (groupId: string, orgId: string) =>
  belongsToOrg('student_groups', groupId, orgId)

export const studentsBelongToOrg = (studentIds: readonly string[], orgId: string) =>
  idsBelongToOrg('students', studentIds, orgId)
