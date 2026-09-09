'use server'

/**
 * Linking a student group to a WhatsApp group, and inviting its parents.
 *
 * Meta's Groups API is gated on Official Business Account status, which a music
 * studio does not have and is unlikely to get (decision #42). So the default —
 * and for now the only — path is a *linked* group: the teacher opens the group
 * on their own phone and pastes its invite link here. Lessio then sends that
 * invite to each parent privately, from the business number, using the approved
 * group_invite template.
 *
 * What this deliberately does NOT do is pretend. Messages are never sent into
 * the group; "message the group" is a broadcast to the group's parents, and the
 * UI says so.
 */

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { getSession, requireMutation } from '@/lib/auth/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { requireFeature } from '@/lib/saas/featureGate'
import { startCampaign } from '@/lib/whatsapp/broadcast/send'

export type WaGroupActionResult = { error: string | null; invited?: number }

/**
 * A WhatsApp group invite link. The code is what the approved template's URL
 * button appends to its fixed https://chat.whatsapp.com/ base, so only the code
 * is stored — a full URL there would produce a doubled link.
 */
const INVITE_LINK = /^https:\/\/chat\.whatsapp\.com\/([A-Za-z0-9_-]{10,})\/?$/

const LinkSchema = z.object({
  groupId: z.string().uuid(),
  inviteLink: z.string().trim().regex(INVITE_LINK, 'INVALID_LINK'),
})

async function requireOwnerOrAdmin() {
  const session = await getSession()
  requireMutation(session)
  if (session.role !== 'owner' && session.role !== 'admin') redirect('/students')
  return session
}

/** Stores the invite code and marks the group as having a linked WhatsApp group. */
export async function linkWhatsAppGroupAction(
  _prev: WaGroupActionResult,
  formData: FormData
): Promise<WaGroupActionResult> {
  const session = await requireOwnerOrAdmin()
  await requireFeature(session.orgId, 'broadcasts')

  const parsed = LinkSchema.safeParse({
    groupId: formData.get('group_id'),
    inviteLink: formData.get('invite_link'),
  })
  if (!parsed.success) return { error: 'INVALID_LINK' }

  const code = parsed.data.inviteLink.match(INVITE_LINK)![1]

  const { error } = await createServiceRoleClient()
    .from('student_groups')
    .update({
      wa_group_mode: 'linked',
      wa_invite_code: code,
      wa_group_linked_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.groupId)
    .eq('organization_id', session.orgId)

  if (error) {
    console.error('[wa-group] link failed', { groupId: parsed.data.groupId, error: error.message })
    return { error: 'SAVE_FAILED' }
  }

  revalidatePath('/students')
  return { error: null }
}

/** Forgets the link. The group itself lives on the teacher's phone, untouched. */
export async function unlinkWhatsAppGroupAction(groupId: string): Promise<WaGroupActionResult> {
  const session = await requireOwnerOrAdmin()

  const { error } = await createServiceRoleClient()
    .from('student_groups')
    .update({ wa_group_mode: 'none', wa_invite_code: null, wa_group_linked_at: null })
    .eq('id', groupId)
    .eq('organization_id', session.orgId)

  if (error) return { error: 'SAVE_FAILED' }
  revalidatePath('/students')
  return { error: null }
}

/**
 * Invites the parents who have not been invited yet.
 *
 * Runs as an ordinary broadcast, so it inherits the guard, the transcript and
 * the delivery report. `onlyUninvited` is what makes it safe to press twice, and
 * what makes adding a student to the group invite that student's parent alone.
 */
export async function inviteGroupParentsAction(groupId: string): Promise<WaGroupActionResult> {
  const session = await requireOwnerOrAdmin()
  await requireFeature(session.orgId, 'broadcasts')

  const db = createServiceRoleClient()
  const { data: group } = await db
    .from('student_groups')
    .select('id, name, wa_invite_code, wa_group_mode')
    .eq('id', groupId)
    .eq('organization_id', session.orgId)
    .maybeSingle()

  const row = group as { id: string; name: string; wa_invite_code: string | null; wa_group_mode: string } | null
  if (!row?.wa_invite_code || row.wa_group_mode === 'none') return { error: 'NOT_LINKED' }

  const { data: created, error } = await db
    .from('broadcast_campaigns')
    .insert({
      organization_id: session.orgId,
      name: row.name,
      template_type: 'group_invite',
      // {{2}} of the invite body is the group's name.
      topic: row.name,
      message: null,
      audience: { kind: 'student_group', groupId, onlyUninvited: true },
      status: 'draft',
      created_by_profile_id: session.profileId,
      created_by_role: session.role,
      student_group_id: groupId,
    })
    .select('id')
    .single()

  if (error || !created) {
    console.error('[wa-group] invite campaign failed', { groupId, error: error?.message })
    return { error: 'CREATE_FAILED' }
  }

  const start = await startCampaign((created as { id: string }).id, {
    subscriptionLapsed: session.isSaasReadOnly === true,
  })

  revalidatePath('/students')
  if (!start.ok) return { error: start.reason }
  return { error: null, invited: start.recipients }
}
