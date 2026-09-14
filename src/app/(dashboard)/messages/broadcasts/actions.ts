'use server'

/**
 * Owner and admin actions behind the broadcast screens.
 *
 * Every one of these follows the same order, and the order matters:
 * session → requireMutation → requireFeature (never inside a try/catch, it
 * redirects) → quota → the guard. The guard is what protects the org's WhatsApp
 * number; the rest protects the tenant boundary and the plan.
 */

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { getSession, requireMutation } from '@/lib/auth/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { requireFeature } from '@/lib/saas/featureGate'
import { resolveAudience } from '@/lib/whatsapp/broadcast/audience'
import { createCampaign } from '@/lib/whatsapp/broadcast/create'
import { checkCampaignResumable } from '@/lib/whatsapp/broadcast/send'
import { categoryOf, type AudienceFilter, type BroadcastType } from '@/lib/whatsapp/broadcast/types'
import { PARAM_LIMITS } from '@/lib/whatsapp/approvedTemplates'
import type { AppLocale } from '@/lib/i18n/locale'

export type BroadcastActionResult = {
  error: string | null
  /** Set when the guard refused, so the screen can explain rather than just fail. */
  guardReason?: string
  campaignId?: string
}

const AudienceSchema: z.ZodType<AudienceFilter> = z.union([
  z.object({ kind: z.literal('all_active') }),
  z.object({
    kind: z.literal('student_group'),
    groupId: z.string().uuid(),
    onlyUninvited: z.boolean().optional(),
  }),
  z.object({ kind: z.literal('lesson'), lessonId: z.string().uuid() }),
  z.object({ kind: z.literal('teacher'), teacherId: z.string().uuid() }),
  z.object({ kind: z.literal('open_debt') }),
  z.object({ kind: z.literal('manual'), parentIds: z.array(z.string().uuid()).min(1) }),
  z.object({ kind: z.literal('list'), listId: z.string().uuid() }),
])

const CreateSchema = z.object({
  name: z.string().min(1).max(120),
  template_type: z.enum(['class_update', 'promo']),
  topic: z.string().max(PARAM_LIMITS.broadcast_topic),
  // One paragraph: Meta strips newlines from a template parameter, so a
  // multi-paragraph announcement would arrive as one run-on line.
  message: z.string().min(1).max(PARAM_LIMITS.broadcast_message),
  audience: z.string().min(1),
  scheduled_at: z.string().optional(),
  consent_attested: z.enum(['on', 'off']).optional(),
})

function parseAudience(raw: string): AudienceFilter | null {
  try {
    const parsed = AudienceSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

async function requireOwnerOrAdmin() {
  const session = await getSession()
  requireMutation(session)
  if (session.role !== 'owner' && session.role !== 'admin') {
    redirect('/dashboard')
  }
  return session
}

/**
 * Live count for the compose screen: who this audience reaches, and who it
 * skips and why — before anything is sent.
 */
export async function previewAudienceAction(
  audienceJson: string,
  templateType: BroadcastType
): Promise<{
  included: number
  skipped: Array<{ reason: string; count: number }>
  error: string | null
}> {
  const session = await requireOwnerOrAdmin()
  await requireFeature(session.orgId, 'broadcasts')

  const filter = parseAudience(audienceJson)
  if (!filter) return { included: 0, skipped: [], error: 'INVALID_AUDIENCE' }

  const db = createServiceRoleClient()
  const { data: org } = await db
    .from('organizations')
    .select('default_locale')
    .eq('id', session.orgId)
    .maybeSingle()

  const result = await resolveAudience(session.orgId, filter, templateType, {
    fallbackLocale: ((org as { default_locale: string | null } | null)?.default_locale as AppLocale) ?? 'he',
  })

  return { included: result.included.length, skipped: result.skipped, error: null }
}

/** Creates a campaign and puts it in flight (or schedules it). */
export async function createBroadcastAction(
  _prev: BroadcastActionResult,
  formData: FormData
): Promise<BroadcastActionResult> {
  const session = await requireOwnerOrAdmin()
  // Outside the try/catch below on purpose: requireFeature redirects, and a
  // redirect caught as an error is silently swallowed.
  await requireFeature(session.orgId, 'broadcasts')

  const parsed = CreateSchema.safeParse({
    name: formData.get('name'),
    template_type: formData.get('template_type'),
    topic: formData.get('topic') ?? '',
    message: formData.get('message'),
    audience: formData.get('audience'),
    scheduled_at: formData.get('scheduled_at') || undefined,
    consent_attested: formData.get('consent_attested') ?? 'off',
  })
  if (!parsed.success) return { error: 'INVALID_INPUT' }

  const filter = parseAudience(parsed.data.audience)
  if (!filter) return { error: 'INVALID_AUDIENCE' }

  const type = parsed.data.template_type as BroadcastType
  const category = categoryOf(type)

  // A promotion needs the owner to say the parents agreed to marketing. The
  // per-parent opt-in still gates each send; this is the attestation on file.
  if (category === 'promo' && parsed.data.consent_attested !== 'on') {
    return { error: 'CONSENT_REQUIRED' }
  }

  const result = await createCampaign({
    orgId: session.orgId,
    profileId: session.profileId,
    role: session.role,
    name: parsed.data.name,
    type,
    topic: parsed.data.topic,
    message: parsed.data.message,
    audience: filter,
    scheduledAt: parsed.data.scheduled_at,
    consentAttested: parsed.data.consent_attested === 'on',
    subscriptionLapsed: session.isSaasReadOnly === true,
  })

  revalidatePath('/messages/broadcasts')

  if (!result.ok) {
    return result.error === 'BLOCKED'
      ? { error: 'BLOCKED', guardReason: result.guardReason, campaignId: result.campaignId }
      : { error: result.error }
  }
  return { error: null, campaignId: result.campaignId }
}

const CampaignIdSchema = z.string().uuid()

/** Pause, resume or cancel a campaign that is already in flight. */
export async function updateBroadcastStatusAction(
  campaignId: string,
  action: 'pause' | 'resume' | 'cancel'
): Promise<BroadcastActionResult> {
  const session = await requireOwnerOrAdmin()
  await requireFeature(session.orgId, 'broadcasts')

  if (!CampaignIdSchema.safeParse(campaignId).success) return { error: 'INVALID_INPUT' }

  // Resume is a SEND decision, not a status edit: it puts the campaign back in
  // flight. Without this it cleared `paused_reason` and re-entered 'sending'
  // with no guard, so a campaign auto-paused for quality_red, blocked_by_meta
  // or repeated failures resumed straight back into whatever paused it.
  // Pausing and cancelling need no permission — they only ever send less.
  if (action === 'resume') {
    const allowed = await checkCampaignResumable(campaignId, session.orgId)
    if (!allowed.ok) return { error: 'BLOCKED', guardReason: allowed.reason, campaignId }
  }

  const db = createServiceRoleClient()
  const status = action === 'pause' ? 'paused' : action === 'resume' ? 'sending' : 'cancelled'

  const { error } = await db
    .from('broadcast_campaigns')
    .update({
      status,
      // Resuming clears the reason it stopped; a stale "quality_red" under a
      // running campaign would be a lie.
      paused_reason: action === 'resume' ? null : undefined,
      consecutive_failures: action === 'resume' ? 0 : undefined,
    })
    .eq('id', campaignId)
    .eq('organization_id', session.orgId)
    .in('status', action === 'resume' ? ['paused'] : ['sending', 'scheduled', 'paused'])

  if (error) {
    console.error('[broadcasts] status update failed', { campaignId, action, error: error.message })
    return { error: 'UPDATE_FAILED' }
  }

  revalidatePath('/messages/broadcasts')
  revalidatePath(`/messages/broadcasts/${campaignId}`)
  return { error: null }
}
