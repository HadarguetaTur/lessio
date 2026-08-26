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
import { DEFAULT_TEMPLATES, TEMPLATE_PREVIEW_VARS, normalizeTemplateBody, type MessageTemplateType } from '@/lib/whatsapp/templates'
import { sendSmartMessage } from '@/lib/whatsapp/sendSmart'
import { BUTTON_LABEL_MAX, CUSTOMIZABLE_BOT_STRINGS } from '@/lib/whatsapp/templateButtons'
import type { BotStringKey } from '@/lib/whatsapp/strings'
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

const ButtonLabelSchema = z.object({
  key: z.string().min(1),
  locale: z.enum(['he', 'en']),
  // BUTTON_LABEL_MAX is Meta's cap and also what the senders clip to; enforcing
  // it here is what lets an owner see the truncation before a parent does.
  value: z.string().min(1, 'validation.messageBodyRequired').max(BUTTON_LABEL_MAX),
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

// ── Button labels ─────────────────────────────────────────────────────────────

/**
 * Rewords one button label for this org, in one language.
 *
 * Only labels on messages sent INSIDE the 24h window can be changed: a label
 * on a Meta-approved template is part of what Meta approved, and the card
 * renders those read-only. The whitelist is the enforcement point — a form can
 * post any key, and CUSTOMIZABLE_BOT_STRINGS is derived from the flows that
 * actually render a label at send time.
 */
export async function saveButtonLabelAction(
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

  const parsed = ButtonLabelSchema.safeParse({
    key: formData.get('key'),
    locale: formData.get('locale'),
    value: String(formData.get('value') ?? '').trim(),
  })

  if (!parsed.success) {
    return { error: await zodError(parsed.error.issues[0]) }
  }

  const { key, locale, value } = parsed.data

  if (!CUSTOMIZABLE_BOT_STRINGS.includes(key as BotStringKey)) {
    console.warn('[message-templates] Rejected a label not open for editing', { orgId, key })
    return { error: await commonError('noPermission') }
  }

  const db = createServiceRoleClient()
  const { error } = await db
    .from('org_bot_strings')
    .upsert(
      { organization_id: orgId, key, locale, value, updated_at: new Date().toISOString() },
      { onConflict: 'organization_id,key,locale' }
    )

  if (error) {
    console.error('[message-templates] Failed to save button label', {
      orgId,
      key,
      locale,
      error: error.message,
    })
    return { error: t('settings.messageTemplatesActions.errors.saveFailed') }
  }

  console.info('[message-templates] Button label saved', { orgId, key, locale })
  revalidatePath('/settings/message-templates')
  return { error: null, success: true }
}

/** Drops the override — the button reverts to Lessio's wording. */
export async function resetButtonLabelAction(
  key: string,
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
    .from('org_bot_strings')
    .delete()
    .eq('organization_id', orgId)
    .eq('key', key)
    .eq('locale', locale)

  if (error) {
    console.error('[message-templates] Failed to reset button label', {
      orgId,
      key,
      locale,
      error: error.message,
    })
    return { error: t('settings.messageTemplatesActions.errors.resetFailed') }
  }

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

// ── sendTestTemplateAction ────────────────────────────────────────────────────

export type SendTestResult = {
  error: string | null
  success?: boolean
  /** True when the send was skipped because the number is not connected. */
  notConnected?: boolean
}

const SendTestSchema = z.object({
  templateType: z.string().min(1),
  locale: z.enum(['he', 'en']),
  // International format only — Meta rejects anything else, and a local-format
  // number silently reaches nobody.
  phone: z.string().regex(/^\+\d{9,15}$/, 'validation.invalidPhone'),
})

/**
 * Per-org throttle, in memory.
 *
 * Deliberately not persisted: this exists to stop a stuck finger sending twenty
 * WhatsApp messages, not as a security control. A deploy resets it, which is
 * fine — the blast radius is the owner's own phone.
 */
const TEST_SEND_LIMIT = 5
const TEST_SEND_WINDOW_MS = 60 * 60 * 1000
const testSendLog = new Map<string, number[]>()

function withinTestSendLimit(orgId: string): boolean {
  const now = Date.now()
  const recent = (testSendLog.get(orgId) ?? []).filter((at) => now - at < TEST_SEND_WINDOW_MS)
  if (recent.length >= TEST_SEND_LIMIT) {
    testSendLog.set(orgId, recent)
    return false
  }
  recent.push(now)
  testSendLog.set(orgId, recent)
  return true
}

/**
 * Sends one template to a number the owner chooses, rendered with the same
 * sample values the Preview uses.
 *
 * Goes through sendSmartMessage so it behaves exactly like a real send: inside
 * the 24h window it is the editable text, outside it the approved template.
 * That is the point — a "test" that took a different path would not tell the
 * owner whether her parents will actually receive anything.
 */
export async function sendTestTemplateAction(
  _prev: SendTestResult,
  formData: FormData
): Promise<SendTestResult> {
  const t = await getTranslations()
  const session = await getSession()
  requireMutation(session)
  const { orgId, role } = session

  if (role !== 'owner') {
    return { error: await commonError('noPermission') }
  }

  await requireFeature(orgId, 'whatsapp_automation')

  const parsed = SendTestSchema.safeParse({
    templateType: formData.get('templateType'),
    locale: formData.get('locale'),
    phone: String(formData.get('phone') ?? '').replace(/[\s-]/g, ''),
  })
  if (!parsed.success) {
    return { error: await zodError(parsed.error.issues[0]) }
  }

  const templateType = parsed.data.templateType as MessageTemplateType
  const previewVars = TEMPLATE_PREVIEW_VARS[templateType]
  if (!previewVars) {
    return { error: t('settings.messageTemplates.test.unknownType') }
  }

  const db = createServiceRoleClient()
  const { data: org } = await db
    .from('organizations')
    .select('whatsapp_phone_number_id, whatsapp_access_token')
    .eq('id', orgId)
    .maybeSingle()

  if (!org?.whatsapp_phone_number_id || !org?.whatsapp_access_token) {
    return { error: t('settings.messageTemplates.test.connectFirst'), notConnected: true }
  }

  if (!withinTestSendLimit(orgId)) {
    return { error: t('settings.messageTemplates.test.rateLimited') }
  }

  let accessToken: string
  try {
    accessToken = decryptToken(org.whatsapp_access_token)
  } catch (err) {
    console.error('[message-templates] Token decryption failed', { orgId, err })
    return { error: t('settings.messageTemplates.test.sendFailed') }
  }

  try {
    const result = await sendSmartMessage({
      orgId,
      phone: parsed.data.phone,
      accessToken,
      phoneNumberId: org.whatsapp_phone_number_id,
      templateType,
      vars: previewVars,
      locale: parsed.data.locale as AppLocale,
    })
    if (!result.sent) {
      console.warn('[message-templates] Test send skipped', { orgId, reason: result.reason })
      return { error: t('settings.messageTemplates.test.sendFailed') }
    }
  } catch (err) {
    console.error('[message-templates] Test send failed', { orgId, templateType, err })
    return { error: t('settings.messageTemplates.test.sendFailed') }
  }

  console.info('[message-templates] Test message sent', { orgId, templateType })
  return { error: null, success: true }
}
