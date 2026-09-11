'use server'

import { revalidatePath } from 'next/cache'
import { DateTime } from 'luxon'
import { z } from 'zod'

import { requirePlatformSession } from '@/lib/superadmin/session'
import { recordAdminAction } from '@/lib/superadmin/audit'
import {
  createLeadFromProspect,
  saveLeadNotes,
  setLeadNextAction,
  updateLeadStatus,
} from '@/lib/outbound/leads'
import { OUTBOUND_TIMEZONE } from '@/lib/outbound/mailboxes'
import { LOST_REASONS, PLATFORM_LEAD_STATUSES } from '@/lib/outbound/types'

/**
 * The founder working a lead by hand from the lead card. Every write here
 * also stops the automated follow-ups for that person (see leads.ts).
 */

export type LeadActionState = { error: string | null; ok?: boolean }

function revalidateBoth(): void {
  revalidatePath('/admin/leads')
  revalidatePath('/admin/outbound')
}

const statusSchema = z.object({
  leadId: z.string().uuid(),
  status: z.enum(PLATFORM_LEAD_STATUSES),
  lostReason: z.enum(LOST_REASONS).optional(),
  lostReasonText: z.string().trim().max(200).optional(),
})

export async function setLeadStatusAction(
  _prev: LeadActionState | null,
  formData: FormData
): Promise<LeadActionState> {
  const session = await requirePlatformSession('growth.write')

  const parsed = statusSchema.safeParse({
    leadId: formData.get('leadId'),
    status: formData.get('status'),
    lostReason: formData.get('lostReason') || undefined,
    lostReasonText: formData.get('lostReasonText') || undefined,
  })
  if (!parsed.success) return { error: 'INVALID_INPUT' }

  const { leadId, status, lostReason, lostReasonText } = parsed.data
  const reason = lostReason === 'other' ? lostReasonText || null : (lostReason ?? null)

  const result = await updateLeadStatus({ leadId, status, actorProfileId: session.profileId, lostReason: reason })
  if (!result.ok) return { error: result.error }

  await recordAdminAction({
    actorProfileId: session.profileId,
    action: 'lead.status_change',
    targetType: 'platform_leads',
    targetId: leadId,
    metadata: { from: result.previous, to: status, lostReason: reason, prospectConverted: result.prospectConverted },
  })

  revalidateBoth()
  return { error: null, ok: true }
}

const notesSchema = z.object({
  leadId: z.string().uuid(),
  notes: z.string().max(5000),
})

export async function saveLeadNotesAction(
  _prev: LeadActionState | null,
  formData: FormData
): Promise<LeadActionState> {
  const session = await requirePlatformSession('growth.write')

  const parsed = notesSchema.safeParse({ leadId: formData.get('leadId'), notes: formData.get('notes') ?? '' })
  if (!parsed.success) return { error: 'INVALID_INPUT' }

  const result = await saveLeadNotes(parsed.data.leadId, parsed.data.notes, session.profileId)
  if (!result.ok) return { error: result.error }

  await recordAdminAction({
    actorProfileId: session.profileId,
    action: 'lead.note',
    targetType: 'platform_leads',
    targetId: parsed.data.leadId,
  })

  revalidateBoth()
  return { error: null, ok: true }
}

const nextActionSchema = z.object({
  leadId: z.string().uuid(),
  // What <input type="datetime-local"> submits: local wall-clock, no zone.
  nextActionAt: z.string().max(30),
  note: z.string().trim().max(500),
})

export async function setNextActionAction(
  _prev: LeadActionState | null,
  formData: FormData
): Promise<LeadActionState> {
  const session = await requirePlatformSession('growth.write')

  const parsed = nextActionSchema.safeParse({
    leadId: formData.get('leadId'),
    nextActionAt: formData.get('nextActionAt') ?? '',
    note: formData.get('note') ?? '',
  })
  if (!parsed.success) return { error: 'INVALID_INPUT' }

  let at: string | null = null
  if (parsed.data.nextActionAt) {
    const local = DateTime.fromISO(parsed.data.nextActionAt, { zone: OUTBOUND_TIMEZONE })
    if (!local.isValid) return { error: 'INVALID_INPUT' }
    at = local.toUTC().toISO()
  }

  const result = await setLeadNextAction(parsed.data.leadId, at, parsed.data.note || null, session.profileId)
  if (!result.ok) return { error: result.error }

  await recordAdminAction({
    actorProfileId: session.profileId,
    action: 'lead.next_action',
    targetType: 'platform_leads',
    targetId: parsed.data.leadId,
    metadata: { at },
  })

  revalidateBoth()
  return { error: null, ok: true }
}

export async function createLeadFromProspectAction(
  _prev: LeadActionState | null,
  formData: FormData
): Promise<LeadActionState> {
  const session = await requirePlatformSession('growth.write')

  const parsed = z.object({ prospectId: z.string().uuid() }).safeParse({ prospectId: formData.get('prospectId') })
  if (!parsed.success) return { error: 'INVALID_INPUT' }

  const result = await createLeadFromProspect(parsed.data.prospectId)
  if (!result) return { error: 'NOT_FOUND' }

  await recordAdminAction({
    actorProfileId: session.profileId,
    action: 'lead.create_from_prospect',
    targetType: 'platform_leads',
    targetId: result.leadId,
    metadata: { prospectId: parsed.data.prospectId, created: result.created },
  })

  revalidateBoth()
  return { error: null, ok: true }
}
