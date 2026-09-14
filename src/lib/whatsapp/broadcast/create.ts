/**
 * Creating a campaign and putting it in flight — the one path, shared.
 *
 * Extracted from the compose screen's action because the inbox needs it too:
 * when Meta's 24h window has closed, the only legal way to reach a parent is an
 * approved template, which is exactly what a campaign sends. A one-person
 * campaign is a strange-sounding thing until you notice that it gets the guard,
 * the consent check, the quota, the opt-out rules, the retry ladder and the
 * transcript entry for free — all of which a bespoke "send a template from the
 * thread" path would have had to reimplement, and would have got wrong.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { requireQuotaCapacity, QuotaExceededError } from '@/lib/saas/quota'
import { resolveAudience } from './audience'
import { classifyBroadcastText } from './classify'
import { startCampaign } from './send'
import { categoryOf, type AudienceFilter, type BroadcastType } from './types'

export type CreateCampaignResult =
  | { ok: true; campaignId: string; recipients: number }
  | { ok: false; error: 'QUOTA_EXCEEDED' | 'CREATE_FAILED'; campaignId?: undefined }
  | { ok: false; error: 'BLOCKED'; guardReason: string; campaignId: string }

export async function createCampaign(params: {
  orgId: string
  profileId: string
  role: string
  name: string
  type: BroadcastType
  topic: string | null
  message: string
  audience: AudienceFilter
  scheduledAt?: string | null
  /** Set for a promo, where the owner has attested the parents opted in. */
  consentAttested?: boolean
  subscriptionLapsed?: boolean
}): Promise<CreateCampaignResult> {
  const db = createServiceRoleClient()
  const category = categoryOf(params.type)

  const audience = await resolveAudience(params.orgId, params.audience, params.type)

  try {
    await requireQuotaCapacity(params.orgId, 'broadcast_recipients_monthly', audience.included.length)
  } catch (err) {
    if (err instanceof QuotaExceededError) return { ok: false, error: 'QUOTA_EXCEEDED' }
    throw err
  }

  // EVERY owner-controlled field that reaches a template BODY is classified,
  // not just `message`. `topic` is body parameter {{2}} of the UTILITY
  // `class_update` template and ships verbatim: the same promotional sentence
  // refused in `message` sailed through in `topic`, so `checkCampaignAllowed`
  // never raised `promotional_content_in_update` and `consentRefusal` admitted
  // every parent who had never opted into marketing.
  const classification = await classifyBroadcastText(
    params.orgId,
    [params.topic, params.message].filter(Boolean).join('\n')
  )

  const { data: created, error } = await db
    .from('broadcast_campaigns')
    .insert({
      organization_id: params.orgId,
      name: params.name,
      template_type: params.type,
      topic: params.topic || null,
      message: params.message,
      audience: params.audience,
      status: 'draft',
      scheduled_at: params.scheduledAt ? new Date(params.scheduledAt).toISOString() : null,
      created_by_profile_id: params.profileId,
      created_by_role: params.role,
      consent_attested_at:
        category === 'promo' && params.consentAttested ? new Date().toISOString() : null,
      student_group_id: params.audience.kind === 'student_group' ? params.audience.groupId : null,
      lesson_id: params.audience.kind === 'lesson' ? params.audience.lessonId : null,
    })
    .select('id')
    .single()

  if (error || !created) {
    console.error('[broadcasts] create failed', { orgId: params.orgId, error: error?.message })
    return { ok: false, error: 'CREATE_FAILED' }
  }

  const campaignId = (created as { id: string }).id
  const start = await startCampaign(campaignId, {
    contentLooksPromotional: classification.promotional,
    subscriptionLapsed: params.subscriptionLapsed === true,
  })

  if (!start.ok) return { ok: false, error: 'BLOCKED', guardReason: start.reason, campaignId }
  return { ok: true, campaignId, recipients: audience.included.length }
}
