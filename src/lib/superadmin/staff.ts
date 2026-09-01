/**
 * The platform's own people.
 * Server-only; service-role client.
 *
 * Per /docs/sprint-34-scope.md § B. There was no path anywhere that created a
 * platform user: the production superadmin was inserted by hand, and every
 * invite flow in the codebase hardcodes `owner` or `teacher`.
 *
 * Staff are ordinary `profiles` rows with a platform role and no
 * `organization_id` — the biconditional in `profiles_platform_org_check`
 * enforces that pairing, so there is no separate members table to drift.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import {
  PLATFORM_ROLES,
  capabilitiesFor,
  isPlatformRole,
  type PlatformCapability,
  type PlatformRole,
} from './capabilities'
import { recordAdminAction } from './audit'

export type StaffMember = {
  profileId: string
  fullName: string
  role: PlatformRole
  isActive: boolean
  capabilities: PlatformCapability[]
  invitedByName: string | null
  createdAt: string
  deactivatedAt: string | null
}

export type StaffResult = { ok: true } | { ok: false; error: string }

/** Roles an operator may hand out. Superadmin is absent on purpose — see
 *  {@link inviteStaff}. */
export const ASSIGNABLE_ROLES: PlatformRole[] = PLATFORM_ROLES.filter(
  (r) => r !== 'superadmin'
)

type RawStaffRow = {
  id: string
  full_name: string
  role: string
  is_active: boolean | null
  created_at: string
  deactivated_at: string | null
  invited_by: string | null
}

export async function listStaff(): Promise<StaffMember[]> {
  const db = createServiceRoleClient()

  const { data, error } = await db
    .from('profiles')
    .select('id, full_name, role, is_active, created_at, deactivated_at, invited_by')
    .is('organization_id', null)
    .order('created_at', { ascending: true })

  if (error || !data) return []

  const rows = (data as RawStaffRow[]).filter((r) => isPlatformRole(r.role))
  const nameById = new Map(rows.map((r) => [r.id, r.full_name]))

  return rows.map((r) => ({
    profileId: r.id,
    fullName: r.full_name,
    role: r.role as PlatformRole,
    isActive: r.is_active !== false,
    capabilities: capabilitiesFor(r.role),
    invitedByName: r.invited_by ? (nameById.get(r.invited_by) ?? null) : null,
    createdAt: r.created_at,
    deactivatedAt: r.deactivated_at,
  }))
}

/**
 * Invites a colleague by email and gives them a platform role.
 *
 * Follows the three-step shape established by `inviteTeacher` — invite, then
 * profile — but adds the compensating delete that one omits, so a failed
 * profile insert does not leave an orphaned auth user nobody can re-invite.
 *
 * A superadmin cannot be minted here. Granting the role that can grant every
 * role should be a deliberate act at the database, not a dropdown.
 */
export async function inviteStaff(params: {
  email: string
  fullName: string
  role: PlatformRole
  actorProfileId: string
}): Promise<StaffResult> {
  const { email, fullName, role, actorProfileId } = params

  if (!ASSIGNABLE_ROLES.includes(role)) return { ok: false, error: 'ROLE_NOT_ASSIGNABLE' }

  const db = createServiceRoleClient()

  const { data: invite, error: inviteError } = await db.auth.admin.inviteUserByEmail(email)
  if (inviteError || !invite?.user) {
    if (inviteError?.message.includes('already been registered')) {
      return { ok: false, error: 'EMAIL_EXISTS' }
    }
    return { ok: false, error: inviteError?.message ?? 'INVITE_FAILED' }
  }

  const userId = invite.user.id

  const { error: profileError } = await db.from('profiles').insert({
    id: userId,
    organization_id: null,
    full_name: fullName,
    role,
    invited_by: actorProfileId,
  })

  if (profileError) {
    // Undo the invite. Without this the address is registered with no profile:
    // the person cannot sign in and cannot be invited again.
    await db.auth.admin.deleteUser(userId).catch(() => {})
    return { ok: false, error: profileError.message }
  }

  await recordAdminAction({
    actorProfileId,
    action: 'staff.invite',
    targetType: 'profiles',
    targetId: userId,
    metadata: { email, role },
  })

  return { ok: true }
}

export async function changeStaffRole(params: {
  profileId: string
  role: PlatformRole
  actorProfileId: string
}): Promise<StaffResult> {
  const { profileId, role, actorProfileId } = params

  if (!ASSIGNABLE_ROLES.includes(role)) return { ok: false, error: 'ROLE_NOT_ASSIGNABLE' }
  if (profileId === actorProfileId) return { ok: false, error: 'CANNOT_CHANGE_OWN_ROLE' }

  const db = createServiceRoleClient()
  const { data: before } = await db
    .from('profiles')
    .select('role, organization_id')
    .eq('id', profileId)
    .maybeSingle()

  if (!before) return { ok: false, error: 'NOT_FOUND' }
  // Guards against pointing this at a tenant user and stripping their org,
  // which the CHECK constraint would reject anyway — but with a raw 23514.
  if (before.organization_id !== null || !isPlatformRole(before.role)) {
    return { ok: false, error: 'NOT_PLATFORM_STAFF' }
  }
  if (before.role === 'superadmin') return { ok: false, error: 'CANNOT_DEMOTE_SUPERADMIN' }

  const { error } = await db.from('profiles').update({ role }).eq('id', profileId)
  if (error) return { ok: false, error: error.message }

  await recordAdminAction({
    actorProfileId,
    action: 'staff.role_change',
    targetType: 'profiles',
    targetId: profileId,
    metadata: { from: before.role, to: role },
  })

  return { ok: true }
}

export async function setStaffActive(params: {
  profileId: string
  isActive: boolean
  actorProfileId: string
}): Promise<StaffResult> {
  const { profileId, isActive, actorProfileId } = params

  // Locking yourself out of the console you administer is never intentional.
  if (profileId === actorProfileId) return { ok: false, error: 'CANNOT_DEACTIVATE_SELF' }

  const db = createServiceRoleClient()
  const { data: before } = await db
    .from('profiles')
    .select('role, organization_id')
    .eq('id', profileId)
    .maybeSingle()

  if (!before || before.organization_id !== null || !isPlatformRole(before.role)) {
    return { ok: false, error: 'NOT_PLATFORM_STAFF' }
  }

  const { error } = await db
    .from('profiles')
    .update({
      is_active: isActive,
      deactivated_at: isActive ? null : new Date().toISOString(),
    })
    .eq('id', profileId)

  if (error) return { ok: false, error: error.message }

  await recordAdminAction({
    actorProfileId,
    action: isActive ? 'staff.reactivate' : 'staff.deactivate',
    targetType: 'profiles',
    targetId: profileId,
    metadata: { role: before.role },
  })

  return { ok: true }
}
