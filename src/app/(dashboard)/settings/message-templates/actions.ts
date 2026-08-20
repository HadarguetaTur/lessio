'use server'

/**
 * Server actions for custom WhatsApp message templates.
 * Owner-only. Per /docs/sprint-16-scope.md § Story 3.
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getSession, requireMutation } from '@/lib/auth/session'
import { requireFeature } from '@/lib/saas/featureGate'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { decryptToken } from '@/lib/crypto'
import { parseAppLocale, type AppLocale } from '@/lib/i18n/locale'
import { DEFAULT_TEMPLATES, normalizeTemplateBody, type MessageTemplateType } from '@/lib/whatsapp/templates'
import { commonError, zodError } from '@/lib/i18n/actionErrors'
import { getTranslations } from 'next-intl/server'
import {
  buildMetaSubmission,
  customTemplateName,
  isSubmittableType,
  submitCustomTemplate,
} from '@/lib/whatsapp/submitTemplate'
import {
  nextTemplateVersion,
  recordSubmission,
  refreshTemplateStatusesFromMeta,
} from '@/lib/whatsapp/templateStatus'

// ── Schemas ───────────────────────────────────────────────────────────────────

const TemplateSchema = z.object({
  type: z.string().min(1),
  locale: z.enum(['he', 'en']),
  body_template: z.string().min(1, 'validation.messageBodyRequired'),
})

// ── Result types ──────────────────────────────────────────────────────────────

export type ActionState = {
  error: string | null
  success?: boolean
}

// ── saveTemplateAction ────────────────────────────────────────────────────────

/**
 * Upserts a custom template for this org in one language.
 * Uses INSERT ... ON CONFLICT (organization_id, type, locale) DO UPDATE.
 */
export async function saveTemplateAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const t = await getTranslations()
  const session = await getSession()
  requireMutation(session)
  const { orgId, role } = session

  if (role !== 'owner') {
    return { error: await commonError('noPermission') }
  }

  await requireFeature(orgId, 'whatsapp_automation')

  const parsed = TemplateSchema.safeParse({
    type: formData.get('type'),
    locale: formData.get('locale'),
    // normalizeTemplateBody: a <form> POST carries textarea content with CRLF
    // line endings; stored verbatim they differ invisibly from the editor's LF copy.
    body_template: normalizeTemplateBody(String(formData.get('body_template') ?? '')),
  })

  if (!parsed.success) {
    return { error: await zodError(parsed.error.issues[0]) }
  }

  const { type, locale, body_template } = parsed.data

  const db = createServiceRoleClient()
  const { error } = await db
    .from('message_templates')
    .upsert(
      { organization_id: orgId, type, locale, body_template, updated_at: new Date().toISOString() },
      { onConflict: 'organization_id,type,locale' }
    )

  if (error) {
    console.error('[message-templates] Failed to upsert template', { orgId, type, locale, error: error.message })
    return { error: t('settings.messageTemplatesActions.errors.saveFailed') }
  }

  console.info('[message-templates] Template saved', { orgId, type, locale })
  revalidatePath('/settings/message-templates')
  return { error: null, success: true }
}

// ── resetTemplateAction ───────────────────────────────────────────────────────

/**
 * Deletes the custom template row — org reverts to system default.
 */
export async function resetTemplateAction(
  type: string,
  locale: 'he' | 'en' = 'he'
): Promise<{ error?: string }> {
  const t = await getTranslations()
  const session = await getSession()
  requireMutation(session)
  const { orgId, role } = session

  if (role !== 'owner') {
    return { error: await commonError('noPermission') }
  }

  await requireFeature(orgId, 'whatsapp_automation')

  const db = createServiceRoleClient()
  const { error } = await db
    .from('message_templates')
    .delete()
    .eq('organization_id', orgId)
    .eq('type', type)
    .eq('locale', locale)

  if (error) {
    console.error('[message-templates] Failed to reset template', { orgId, type, locale, error: error.message })
    return { error: t('settings.messageTemplatesActions.errors.resetFailed') }
  }

  console.info('[message-templates] Template reset to default', { orgId, type, locale })
  revalidatePath('/settings/message-templates')
  return {}
}

// ── Meta approval ─────────────────────────────────────────────────────────────

/**
 * Outcome of a Meta submission.
 *
 * `error` carries a stable code, not a sentence — the card renders it through
 * next-intl so an English-speaking owner gets an English explanation, matching
 * `registerTemplates` in ../whatsapp/actions.ts. (The two older actions above
 * predate that convention and still return Hebrew strings.)
 */
export type SubmitTemplateResult = {
  error: string | null
  /** Set with `error: 'unknownVariable'` — the offending {{name}}. */
  variable?: string
  /** Meta's own rejection text, when it gave one. Already user-facing. */
  metaMessage?: string | null
  /** The Meta template name that is now PENDING. */
  templateName?: string
  success?: boolean
}

/**
 * Submits the org's saved body for one template type to Meta for approval.
 *
 * Deliberately reads the *saved* body rather than taking one from the client:
 * what gets approved must be what the bot will actually send, and the card
 * blocks submitting while the textarea has unsaved edits.
 */
export async function submitTemplateForApprovalAction(
  type: string,
  localeInput: string
): Promise<SubmitTemplateResult> {
  const session = await getSession()
  requireMutation(session)
  const { orgId, role, profileId } = session

  if (role !== 'owner') return { error: 'forbidden' }

  await requireFeature(orgId, 'whatsapp_automation')

  if (!isSubmittableType(type)) return { error: 'notSubmittable' }
  const templateType = type as MessageTemplateType
  const locale: AppLocale = parseAppLocale(localeInput)

  const db = createServiceRoleClient()

  const { data: org } = await db
    .from('organizations')
    .select('whatsapp_waba_id, whatsapp_access_token')
    .eq('id', orgId)
    .maybeSingle()

  if (!org?.whatsapp_waba_id || !org?.whatsapp_access_token) {
    return { error: 'notConnected' }
  }

  let accessToken: string
  try {
    accessToken = decryptToken(org.whatsapp_access_token)
  } catch (err) {
    console.error('[message-templates] Token decryption failed', { orgId, err })
    return { error: 'decryptFailed' }
  }

  // Same fallback the bot uses: a custom row for this language, else the
  // system default. An org that never edited the copy can still submit it.
  const { data: customRow } = await db
    .from('message_templates')
    .select('body_template')
    .eq('organization_id', orgId)
    .eq('type', templateType)
    .eq('locale', locale)
    .maybeSingle()

  // Rows saved before normalization-on-save still hold CRLF; normalize on read.
  const body = normalizeTemplateBody(customRow?.body_template ?? DEFAULT_TEMPLATES[locale][templateType])

  const submission = buildMetaSubmission(templateType, locale, body)
  if (!submission.ok) {
    return { error: submission.code, variable: submission.variable }
  }

  let version: number
  try {
    version = await nextTemplateVersion(orgId, templateType, locale)
  } catch (err) {
    console.error('[message-templates] Could not determine template version', { orgId, type, err })
    return { error: 'submitFailed' }
  }

  const templateName = customTemplateName(templateType, locale, version)

  const outcome = await submitCustomTemplate({
    wabaId: org.whatsapp_waba_id,
    accessToken,
    name: templateName,
    language: locale,
    bodyText: submission.bodyText,
    example: submission.example,
  })

  if (!outcome.ok) {
    console.error('[message-templates] Meta rejected template submission', {
      orgId,
      templateName,
      detail: outcome.detail,
    })
    return { error: 'submitFailed', metaMessage: outcome.userMessage }
  }

  // Recorded after Meta accepted it, so a failed POST cannot burn a version
  // number and leave a phantom PENDING row the owner cannot clear.
  try {
    await recordSubmission(orgId, {
      templateName,
      language: locale,
      type: templateType,
      version,
      bodyText: submission.bodyText,
      varOrder: submission.varOrder,
      metaTemplateId: outcome.metaTemplateId,
      submittedBy: profileId ?? null,
    })
  } catch (err) {
    // Meta has it; we lost our copy of the fact. Refresh recovers it.
    console.error('[message-templates] Submitted to Meta but failed to record locally', {
      orgId,
      templateName,
      err,
    })
    return { error: 'recordFailed', templateName }
  }

  console.info('[message-templates] Template submitted to Meta', { orgId, templateName, version })
  revalidatePath('/settings/message-templates')
  return { error: null, success: true, templateName }
}

/**
 * Re-reads every template status straight from the org's WABA.
 *
 * The `message_template_status_update` webhook is the normal path, but it only
 * fires on transitions and needs that field subscribed in the Meta console —
 * so this is both the catch-up for orgs that connected earlier and the way to
 * see an approval land without waiting.
 */
export async function refreshTemplateStatusesAction(): Promise<SubmitTemplateResult> {
  const session = await getSession()
  requireMutation(session)
  const { orgId, role } = session

  if (role !== 'owner') return { error: 'forbidden' }

  await requireFeature(orgId, 'whatsapp_automation')

  const db = createServiceRoleClient()
  const { data: org } = await db
    .from('organizations')
    .select('whatsapp_waba_id, whatsapp_access_token')
    .eq('id', orgId)
    .maybeSingle()

  if (!org?.whatsapp_waba_id || !org?.whatsapp_access_token) {
    return { error: 'notConnected' }
  }

  let accessToken: string
  try {
    accessToken = decryptToken(org.whatsapp_access_token)
  } catch (err) {
    console.error('[message-templates] Token decryption failed', { orgId, err })
    return { error: 'decryptFailed' }
  }

  try {
    await refreshTemplateStatusesFromMeta(orgId, org.whatsapp_waba_id, accessToken)
  } catch (err) {
    console.error('[message-templates] Status refresh failed', { orgId, err })
    return { error: 'refreshFailed' }
  }

  revalidatePath('/settings/message-templates')
  return { error: null, success: true }
}
