'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requirePlatformSession } from '@/lib/superadmin/session'
import { recordAdminAction } from '@/lib/superadmin/audit'
import { importProspects, type ImportProspectsResult } from '@/lib/outbound/importProspects'
import { saveCampaign } from '@/lib/outbound/campaigns'
import { addSuppression, suppressProspect } from '@/lib/outbound/suppressions'
import { markInboundReviewed } from '@/lib/outbound/messages'
import { approveOpener, regenerateOpener } from '@/lib/outbound/opener'
import { saveMailbox } from '@/lib/outbound/mailboxes'
import {
  approveDiscoveryCandidates, runDiscovery, requestCandidateResearch, saveDiscoveryAutomation,
  rejectDiscoveryCandidates, deleteDiscoveryCandidates, updateDiscoveryCandidate,
} from '@/lib/outbound/discovery'
import { isServiceAccountConfigured, sendAsUser } from '@/lib/gmail/serviceAccount'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

/**
 * /admin/outbound — the operator's writes: campaign copy, a CSV of prospects,
 * a manual suppression, the mailbox pool, and a test send that proves the
 * Workspace delegation works. Everything else the engine does on its own
 * from the two cron routes under /api/internal/outbound/.
 */

export type OutboundActionState = {
  error?: string
  ok?: boolean
  importResult?: Pick<ImportProspectsResult, 'inserted' | 'suppressed' | 'duplicates'> & {
    invalid: number
    invalidRows: string
  }
  /** For the test send: where the email went. */
  sentTo?: string
  detail?: string
}

const candidateIdsSchema = z.object({
  candidateIds: z.array(z.string().uuid()).min(1).max(50),
})

/** Collects business identities for the durable research queue. */
export async function runDiscoveryAction(
  _prev: OutboundActionState | null,
  _formData: FormData
): Promise<OutboundActionState> {
  void _prev
  void _formData
  const session = await requirePlatformSession('growth.write')
  try {
    const result = await runDiscovery()
    await recordAdminAction({
      actorProfileId: session.profileId,
      action: 'outbound.discovery_run',
      targetType: 'outbound_discovery_runs',
      metadata: result,
    })
    revalidatePath('/admin/outbound')
    // Zero with no room left is the daily cap, not a failed search.
    if (result.found === 0 && result.budget_left === 0) return { error: 'DAILY_BUDGET_FULL' }
    return { ok: true, detail: `${result.found}` }
  } catch (error) {
    console.error('[admin/outbound] discovery failed', error)
    return { error: 'DISCOVERY_FAILED' }
  }
}

/** Approves one or many reviewed candidates into the existing send queue. */
export async function approveDiscoveryCandidatesAction(
  _prev: OutboundActionState | null,
  formData: FormData
): Promise<OutboundActionState> {
  const session = await requirePlatformSession('growth.write')
  let candidateIds: unknown
  try {
    candidateIds = JSON.parse(String(formData.get('candidateIds') ?? '[]'))
  } catch {
    return { error: 'INVALID_INPUT' }
  }
  const parsed = candidateIdsSchema.safeParse({ candidateIds })
  if (!parsed.success) return { error: 'INVALID_INPUT' }
  try {
    const result = await approveDiscoveryCandidates({ candidateIds: parsed.data.candidateIds, actorProfileId: session.profileId })
    await recordAdminAction({
      actorProfileId: session.profileId,
      action: 'outbound.discovery_approve',
      targetType: 'outbound_candidates',
      metadata: { count: parsed.data.candidateIds.length, ...result },
    })
    revalidatePath('/admin/outbound')
    return { ok: true, detail: `${result.approved}` }
  } catch (error) {
    console.error('[admin/outbound] candidate approval failed', error)
    return { error: 'SAVE_FAILED' }
  }
}

const MAX_CSV_BYTES = 5 * 1024 * 1024

const importSchema = z.object({
  campaignId: z.string().uuid(),
  generateOpeners: z.boolean(),
})

export async function importProspectsAction(
  _prev: OutboundActionState | null,
  formData: FormData
): Promise<OutboundActionState> {
  const session = await requirePlatformSession('growth.write')

  const parsed = importSchema.safeParse({
    campaignId: formData.get('campaignId'),
    generateOpeners: formData.get('generateOpeners') === 'on',
  })
  if (!parsed.success) return { error: 'INVALID_INPUT' }

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return { error: 'NO_FILE' }
  if (file.size > MAX_CSV_BYTES) return { error: 'FILE_TOO_LARGE' }
  if (!file.name.toLowerCase().endsWith('.csv')) return { error: 'NOT_CSV' }

  let result: ImportProspectsResult
  try {
    result = await importProspects({
      campaignId: parsed.data.campaignId,
      file: await file.arrayBuffer(),
      filename: file.name,
      generateOpeners: parsed.data.generateOpeners,
    })
  } catch (err) {
    console.error('[admin/outbound] import failed', err)
    return { error: 'IMPORT_FAILED' }
  }

  await recordAdminAction({
    actorProfileId: session.profileId,
    action: 'outbound.import',
    targetType: 'outbound_campaigns',
    targetId: parsed.data.campaignId,
    metadata: {
      batchId: result.batchId,
      inserted: result.inserted,
      suppressed: result.suppressed,
      duplicates: result.duplicates,
      invalid: result.invalid.length,
      filename: file.name,
    },
  })

  revalidatePath('/admin/outbound')
  return {
    ok: true,
    importResult: {
      inserted: result.inserted,
      suppressed: result.suppressed,
      duplicates: result.duplicates,
      invalid: result.invalid.length,
      invalidRows: result.invalid
        .slice(0, 20)
        .map((i) => `${i.row}: ${i.reason}`)
        .join(', '),
    },
  }
}

const campaignSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(120),
  subject: z.string().trim().min(2).max(300),
  bodyText: z.string().trim().min(10).max(10_000),
  locale: z.enum(['he', 'en']),
  isActive: z.boolean(),
})

export async function saveCampaignAction(
  _prev: OutboundActionState | null,
  formData: FormData
): Promise<OutboundActionState> {
  const session = await requirePlatformSession('growth.write')

  const parsed = campaignSchema.safeParse({
    id: formData.get('id') || undefined,
    name: formData.get('name'),
    subject: formData.get('subject'),
    bodyText: formData.get('bodyText'),
    locale: formData.get('locale'),
    isActive: formData.get('isActive') === 'on',
  })
  if (!parsed.success) return { error: 'INVALID_INPUT' }

  const result = await saveCampaign(parsed.data)
  if (!result.ok) return { error: result.error }

  await recordAdminAction({
    actorProfileId: session.profileId,
    action: 'outbound.campaign_save',
    targetType: 'outbound_campaigns',
    targetId: result.id,
    metadata: { name: parsed.data.name, isActive: parsed.data.isActive, locale: parsed.data.locale },
  })

  revalidatePath('/admin/outbound')
  return { ok: true }
}

const suppressionSchema = z.object({
  email: z.email(),
})

export async function addSuppressionAction(
  _prev: OutboundActionState | null,
  formData: FormData
): Promise<OutboundActionState> {
  const session = await requirePlatformSession('growth.write')

  const parsed = suppressionSchema.safeParse({
    email: String(formData.get('email') ?? '').trim().toLowerCase(),
  })
  if (!parsed.success) return { error: 'INVALID_INPUT' }

  const result = await addSuppression({
    email: parsed.data.email,
    reason: 'manual',
    source: `admin:${session.profileId}`,
  })
  if (!result.ok) return { error: result.error }

  await recordAdminAction({
    actorProfileId: session.profileId,
    action: 'outbound.suppression_add',
    targetType: 'outbound_suppressions',
    targetId: parsed.data.email,
    metadata: { created: result.created },
  })

  revalidatePath('/admin/outbound')
  return { ok: true }
}

const mailboxSchema = z.object({
  id: z.string().uuid().optional(),
  email: z.email(),
  displayName: z.string().trim().max(120).nullable(),
  dailyCap: z.number().int().min(0).max(500),
  isActive: z.boolean(),
})

export async function saveMailboxAction(
  _prev: OutboundActionState | null,
  formData: FormData
): Promise<OutboundActionState> {
  const session = await requirePlatformSession('growth.write')

  const parsed = mailboxSchema.safeParse({
    id: formData.get('id') || undefined,
    email: String(formData.get('email') ?? '').trim().toLowerCase(),
    displayName: String(formData.get('displayName') ?? '').trim() || null,
    dailyCap: Number(formData.get('dailyCap')),
    isActive: formData.get('isActive') === 'on',
  })
  if (!parsed.success) return { error: 'INVALID_INPUT' }

  const result = await saveMailbox(parsed.data)
  if (!result.ok) return { error: result.error }

  await recordAdminAction({
    actorProfileId: session.profileId,
    action: 'outbound.mailbox_save',
    targetType: 'outbound_mailboxes',
    targetId: result.id,
    metadata: { email: parsed.data.email, dailyCap: parsed.data.dailyCap, isActive: parsed.data.isActive },
  })

  revalidatePath('/admin/outbound')
  return { ok: true }
}

const testSendSchema = z.object({
  mailboxId: z.string().uuid(),
  to: z.email(),
})

/**
 * Sends one plain email from a mailbox to an address the operator types —
 * the first thing to try after setting up delegation, before any campaign.
 * Never touches the queue or the prospect table.
 */
export async function sendMailboxTestAction(
  _prev: OutboundActionState | null,
  formData: FormData
): Promise<OutboundActionState> {
  const session = await requirePlatformSession('growth.write')
  if (!isServiceAccountConfigured()) return { error: 'SA_NOT_CONFIGURED' }

  const parsed = testSendSchema.safeParse({
    mailboxId: formData.get('mailboxId'),
    to: String(formData.get('to') ?? '').trim().toLowerCase(),
  })
  if (!parsed.success) return { error: 'INVALID_INPUT' }

  const db = createServiceRoleClient()
  const { data: box } = await db
    .from('outbound_mailboxes')
    .select('id, email, display_name')
    .eq('id', parsed.data.mailboxId)
    .maybeSingle()
  if (!box) return { error: 'NOT_FOUND' }

  const stamp = new Date().toISOString()
  try {
    const sent = await sendAsUser({
      from: box.email as string,
      fromName: box.display_name as string | null,
      to: parsed.data.to,
      subject: 'Lessio outbound — test',
      text: `Sent from ${box.email} through Lessio's outbound engine at ${stamp}.`,
      html: `<p>Sent from <b>${box.email}</b> through Lessio's outbound engine at ${stamp}.</p>`,
    })
    await db.from('outbound_mailboxes').update({ last_error: null, last_error_at: null }).eq('id', box.id)
    await recordAdminAction({
      actorProfileId: session.profileId,
      action: 'outbound.mailbox_test',
      targetType: 'outbound_mailboxes',
      targetId: box.id as string,
      metadata: { to: parsed.data.to, messageId: sent.id },
    })
    revalidatePath('/admin/outbound')
    return { ok: true, sentTo: parsed.data.to }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    await db
      .from('outbound_mailboxes')
      .update({ last_error: detail.slice(0, 500), last_error_at: stamp })
      .eq('id', box.id)
    revalidatePath('/admin/outbound')
    return { error: 'TEST_SEND_FAILED', detail: detail.slice(0, 300) }
  }
}

// ── Opener review ────────────────────────────────────────────────────────────
// The AI drafts, a person decides. Until one of these runs, the prospect is
// invisible to the send claim.

const openerSchema = z.object({
  prospectId: z.string().uuid(),
  text: z.string().max(300).optional(),
})

export async function approveOpenerAction(
  _prev: OutboundActionState | null,
  formData: FormData
): Promise<OutboundActionState> {
  const session = await requirePlatformSession('growth.write')

  const parsed = openerSchema.safeParse({
    prospectId: formData.get('prospectId'),
    text: typeof formData.get('text') === 'string' ? String(formData.get('text')) : undefined,
  })
  if (!parsed.success) return { error: 'INVALID_INPUT' }

  try {
    await approveOpener(parsed.data.prospectId, parsed.data.text ?? null)
  } catch (err) {
    console.error('[admin/outbound] opener approve failed', err)
    return { error: 'SAVE_FAILED' }
  }

  await recordAdminAction({
    actorProfileId: session.profileId,
    action: 'outbound.opener_approve',
    targetType: 'outbound_prospects',
    targetId: parsed.data.prospectId,
    metadata: { empty: !parsed.data.text?.trim() },
  })

  revalidatePath('/admin/outbound')
  return { ok: true }
}

export async function regenerateOpenerAction(
  _prev: OutboundActionState | null,
  formData: FormData
): Promise<OutboundActionState> {
  const session = await requirePlatformSession('growth.write')

  const parsed = z.object({ prospectId: z.string().uuid() }).safeParse({
    prospectId: formData.get('prospectId'),
  })
  if (!parsed.success) return { error: 'INVALID_INPUT' }

  let outcome: Awaited<ReturnType<typeof regenerateOpener>>
  try {
    outcome = await regenerateOpener(parsed.data.prospectId)
  } catch (err) {
    console.error('[admin/outbound] opener regenerate failed', err)
    return { error: 'SAVE_FAILED' }
  }

  await recordAdminAction({
    actorProfileId: session.profileId,
    action: 'outbound.opener_regenerate',
    targetType: 'outbound_prospects',
    targetId: parsed.data.prospectId,
    metadata: { ok: outcome.ok },
  })

  revalidatePath('/admin/outbound')
  return outcome.ok ? { ok: true, detail: outcome.text } : { error: `OPENER_${outcome.error}` }
}

// ── From the lead card ───────────────────────────────────────────────────────

export async function suppressProspectAction(
  _prev: OutboundActionState | null,
  formData: FormData
): Promise<OutboundActionState> {
  const session = await requirePlatformSession('growth.write')

  const parsed = z.object({ prospectId: z.string().uuid() }).safeParse({ prospectId: formData.get('prospectId') })
  if (!parsed.success) return { error: 'INVALID_INPUT' }

  const result = await suppressProspect(parsed.data.prospectId, `admin:${session.profileId}`)
  if (!result.ok) return { error: result.error }

  await recordAdminAction({
    actorProfileId: session.profileId,
    action: 'outbound.suppress_prospect',
    targetType: 'outbound_prospects',
    targetId: parsed.data.prospectId,
  })

  revalidatePath('/admin/outbound')
  revalidatePath('/admin/leads')
  return { ok: true }
}

export async function markReplyReviewedAction(
  _prev: OutboundActionState | null,
  formData: FormData
): Promise<OutboundActionState> {
  const session = await requirePlatformSession('growth.write')

  const parsed = z
    .object({ messageId: z.string().uuid().optional(), prospectId: z.string().uuid().optional() })
    .refine((v) => v.messageId || v.prospectId)
    .safeParse({
      messageId: formData.get('messageId') || undefined,
      prospectId: formData.get('prospectId') || undefined,
    })
  if (!parsed.success) return { error: 'INVALID_INPUT' }

  const key = parsed.data.messageId ? { messageId: parsed.data.messageId } : { prospectId: parsed.data.prospectId! }
  const changed = await markInboundReviewed(key)

  await recordAdminAction({
    actorProfileId: session.profileId,
    action: 'outbound.reply_reviewed',
    targetType: 'outbound_messages',
    targetId: parsed.data.messageId ?? parsed.data.prospectId,
    metadata: { changed },
  })

  revalidatePath('/admin/outbound')
  revalidatePath('/admin/leads')
  return { ok: true }
}

/** Research runs in the durable background queue, avoiding action timeouts. */
export async function researchCandidatesAction(
  _prev: OutboundActionState | null,
  formData: FormData,
): Promise<OutboundActionState> {
  const session = await requirePlatformSession('growth.write')
  let ids: unknown
  try { ids = JSON.parse(String(formData.get('candidateIds') ?? '[]')) } catch { return { error: 'INVALID_INPUT' } }
  const parsed = candidateIdsSchema.safeParse({ candidateIds: ids })
  if (!parsed.success) return { error: 'INVALID_INPUT' }
  try {
    const count = await requestCandidateResearch(parsed.data.candidateIds)
    await recordAdminAction({ actorProfileId: session.profileId, action: 'outbound.research_requested',
      targetType: 'outbound_candidates', metadata: { ids: parsed.data.candidateIds, count } })
    revalidatePath('/admin/outbound')
    return { ok: true, detail: String(count) }
  } catch { return { error: 'RESEARCH_FAILED' } }
}

function parseCandidateIds(formData: FormData): string[] | null {
  let ids: unknown
  try { ids = JSON.parse(String(formData.get('candidateIds') ?? '[]')) } catch { return null }
  const parsed = candidateIdsSchema.safeParse({ candidateIds: ids })
  return parsed.success ? parsed.data.candidateIds : null
}

/** "Not relevant": the candidate stays visible under blocked, and research leaves it alone. */
export async function rejectCandidatesAction(
  _prev: OutboundActionState | null,
  formData: FormData,
): Promise<OutboundActionState> {
  const session = await requirePlatformSession('growth.write')
  const ids = parseCandidateIds(formData)
  if (!ids) return { error: 'INVALID_INPUT' }
  try {
    const count = await rejectDiscoveryCandidates(ids)
    await recordAdminAction({ actorProfileId: session.profileId, action: 'outbound.candidate_reject',
      targetType: 'outbound_candidates', metadata: { ids, count } })
    revalidatePath('/admin/outbound')
    return { ok: true, detail: String(count) }
  } catch { return { error: 'SAVE_FAILED' } }
}

export async function deleteCandidatesAction(
  _prev: OutboundActionState | null,
  formData: FormData,
): Promise<OutboundActionState> {
  const session = await requirePlatformSession('growth.write')
  const ids = parseCandidateIds(formData)
  if (!ids) return { error: 'INVALID_INPUT' }
  try {
    const count = await deleteDiscoveryCandidates(ids)
    await recordAdminAction({ actorProfileId: session.profileId, action: 'outbound.candidate_delete',
      targetType: 'outbound_candidates', metadata: { ids, count } })
    revalidatePath('/admin/outbound')
    return { ok: true, detail: String(count) }
  } catch { return { error: 'SAVE_FAILED' } }
}

const candidateEditSchema = z.object({
  id: z.string().uuid(),
  businessName: z.string().trim().min(2).max(200),
  email: z.email().nullable(),
})

export async function updateCandidateAction(
  _prev: OutboundActionState | null,
  formData: FormData,
): Promise<OutboundActionState> {
  const session = await requirePlatformSession('growth.write')
  const parsed = candidateEditSchema.safeParse({
    id: formData.get('id'),
    businessName: formData.get('businessName'),
    email: String(formData.get('email') ?? '').trim().toLowerCase() || null,
  })
  if (!parsed.success) return { error: 'INVALID_INPUT' }
  try {
    const result = await updateDiscoveryCandidate(parsed.data)
    if (result !== 'ok') return { error: result }
    await recordAdminAction({ actorProfileId: session.profileId, action: 'outbound.candidate_edit',
      targetType: 'outbound_candidates', targetId: parsed.data.id, metadata: { businessName: parsed.data.businessName, email: parsed.data.email } })
    revalidatePath('/admin/outbound')
    return { ok: true }
  } catch { return { error: 'SAVE_FAILED' } }
}

export async function saveDiscoveryAutomationAction(
  _prev: OutboundActionState | null,
  formData: FormData,
): Promise<OutboundActionState> {
  const session = await requirePlatformSession('growth.write')
  const parsed = z.object({ auto_approve: z.boolean(), campaign_id: z.string().uuid().nullable() }).safeParse({
    auto_approve: formData.get('autoApprove') === 'on', campaign_id: formData.get('campaignId') || null,
  })
  if (!parsed.success) return { error: 'INVALID_INPUT' }
  try {
    await saveDiscoveryAutomation({ ...parsed.data, actorProfileId: session.profileId })
    await recordAdminAction({ actorProfileId: session.profileId, action: 'outbound.automation_changed',
      targetType: 'outbound_discovery_settings', metadata: parsed.data })
    revalidatePath('/admin/outbound')
    return { ok: true }
  } catch (error) {
    const code = error instanceof Error ? error.message : ''
    return { error: ['CAMPAIGN_REQUIRED', 'CAMPAIGN_REQUIRES_PERSONAL_LINE'].includes(code) ? code : 'SAVE_FAILED' }
  }
}
