/**
 * Meta approval status for WhatsApp templates.
 *
 * Backed by `whatsapp_template_statuses`, which holds two kinds of row:
 *   * org-authored submissions (type/version/body_text/var_order set) — the send
 *     path prefers the highest approved version over Lessio's built-in template
 *   * Lessio's built-in registry (those columns NULL) — tracked for display only
 *
 * Status arrives from two directions: the `message_template_status_update`
 * webhook, and an on-demand read of GET /{WABA_ID}/message_templates. Both land
 * here through `upsertTemplateStatus`.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { AppLocale } from '@/lib/i18n/locale'
import type { MessageTemplateType } from './templates'
import { META_API_VERSION } from './graphVersion'

/** Meta's own status vocabulary, stored verbatim in upper case. */
export type TemplateStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAUSED' | 'DISABLED' | string

export type TemplateStatusRow = {
  templateName: string
  language: string
  status: TemplateStatus
  reason: string | null
  type: string | null
  version: number | null
  bodyText: string | null
  varOrder: string[] | null
  updatedAt: string
}

type DbRow = {
  template_name: string
  language: string
  status: string
  reason: string | null
  type: string | null
  version: number | null
  body_text: string | null
  var_order: string[] | null
  updated_at: string
}

function toRow(r: DbRow): TemplateStatusRow {
  return {
    templateName: r.template_name,
    language: r.language,
    status: r.status,
    reason: r.reason,
    type: r.type,
    version: r.version,
    bodyText: r.body_text,
    varOrder: r.var_order,
    updatedAt: r.updated_at,
  }
}

const SELECT_COLS =
  'template_name, language, status, reason, type, version, body_text, var_order, updated_at'

// ── Reads ─────────────────────────────────────────────────────────────────────

/** Every tracked template for an org — used by the settings page. */
export async function getTemplateStatuses(orgId: string): Promise<TemplateStatusRow[]> {
  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('whatsapp_template_statuses')
    .select(SELECT_COLS)
    .eq('organization_id', orgId)
    .order('version', { ascending: false })

  if (error) {
    console.error('[templateStatus] Failed to load statuses', { orgId, error: error.message })
    return []
  }
  return ((data ?? []) as DbRow[]).map(toRow)
}

/**
 * The org's own approved template for a type, or null to use Lessio's built-in one.
 *
 * Highest version wins: a newer submission sitting in PENDING must not displace
 * the version Meta has already approved, which is the whole reason submissions
 * ship under a new name instead of editing in place.
 *
 * Never throws. This runs on the out-of-window send path, where a lookup failure
 * must degrade to the built-in template rather than drop a parent's reminder.
 */
export async function getApprovedCustomTemplate(
  orgId: string,
  type: MessageTemplateType,
  locale: AppLocale
): Promise<{ name: string; language: string; varOrder: string[] } | null> {
  try {
    const db = createServiceRoleClient()
    const { data, error } = await db
      .from('whatsapp_template_statuses')
      .select('template_name, language, var_order')
      .eq('organization_id', orgId)
      .eq('type', type)
      .eq('language', locale)
      .eq('status', 'APPROVED')
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.warn('[templateStatus] Approved-template lookup failed — using built-in', {
        orgId,
        type,
        locale,
        error: error.message,
      })
      return null
    }
    if (!data?.var_order) return null

    const row = data as { template_name: string; language: string; var_order: string[] }
    return { name: row.template_name, language: row.language, varOrder: row.var_order }
  } catch (err) {
    console.warn('[templateStatus] Approved-template lookup threw — using built-in', {
      orgId,
      type,
      locale,
      err,
    })
    return null
  }
}

/** Next `_c<n>` version for this org/type/language. Starts at 1. */
export async function nextTemplateVersion(
  orgId: string,
  type: MessageTemplateType,
  locale: AppLocale
): Promise<number> {
  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('whatsapp_template_statuses')
    .select('version')
    .eq('organization_id', orgId)
    .eq('type', type)
    .eq('language', locale)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[templateStatus] Version lookup failed', { orgId, type, error: error.message })
    throw new Error('Failed to determine next template version')
  }

  return ((data as { version: number | null } | null)?.version ?? 0) + 1
}

// ── Writes ────────────────────────────────────────────────────────────────────

/**
 * Records the status of a template.
 *
 * Only the status columns are written, so a webhook update for an org-authored
 * template leaves its type/version/body_text/var_order intact — those are what
 * the send path reads.
 */
export async function upsertTemplateStatus(
  orgId: string,
  input: { templateName: string; language: string; status: string; reason?: string | null }
): Promise<void> {
  const db = createServiceRoleClient()
  const { error } = await db.from('whatsapp_template_statuses').upsert(
    {
      organization_id: orgId,
      template_name: input.templateName,
      language: input.language,
      status: input.status.toUpperCase(),
      reason: input.reason ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'organization_id,template_name,language' }
  )

  if (error) {
    console.error('[templateStatus] Failed to upsert status', {
      orgId,
      templateName: input.templateName,
      error: error.message,
    })
    throw new Error('Failed to record template status')
  }
}

/** Records a freshly submitted org-authored template as PENDING. */
export async function recordSubmission(
  orgId: string,
  input: {
    templateName: string
    language: AppLocale
    type: MessageTemplateType
    version: number
    bodyText: string
    varOrder: string[]
    metaTemplateId: string | null
    submittedBy: string | null
  }
): Promise<void> {
  const db = createServiceRoleClient()
  const { error } = await db.from('whatsapp_template_statuses').upsert(
    {
      organization_id: orgId,
      template_name: input.templateName,
      language: input.language,
      status: 'PENDING',
      reason: null,
      type: input.type,
      version: input.version,
      body_text: input.bodyText,
      var_order: input.varOrder,
      meta_template_id: input.metaTemplateId,
      submitted_by: input.submittedBy,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'organization_id,template_name,language' }
  )

  if (error) {
    console.error('[templateStatus] Failed to record submission', {
      orgId,
      templateName: input.templateName,
      error: error.message,
    })
    throw new Error('Failed to record template submission')
  }
}

// ── Refresh from Meta ─────────────────────────────────────────────────────────

type MetaTemplateListEntry = {
  name?: string
  status?: string
  language?: string
  rejected_reason?: string
}

/**
 * Pulls current statuses straight from the WABA and stores them.
 *
 * The webhook is the normal path, but it needs the `message_template_status_update`
 * field subscribed in the Meta console and it only fires on *changes* — so an org
 * that connected earlier would show nothing until its next transition. This is
 * the on-demand catch-up, and it is what makes a live demo deterministic.
 *
 * Returns how many rows were touched.
 */
export async function refreshTemplateStatusesFromMeta(
  orgId: string,
  wabaId: string,
  accessToken: string
): Promise<number> {
  const url =
    `https://graph.facebook.com/${META_API_VERSION}/${wabaId}/message_templates` +
    `?fields=name,status,language,rejected_reason&limit=200`

  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    console.error('[templateStatus] Meta template list failed', { orgId, status: res.status, body })
    throw new Error(`Meta template list failed: ${res.status}`)
  }

  const payload = (await res.json()) as { data?: MetaTemplateListEntry[] }
  const entries = (payload.data ?? []).filter(
    (t): t is MetaTemplateListEntry & { name: string; status: string; language: string } =>
      Boolean(t.name && t.status && t.language)
  )

  for (const entry of entries) {
    // Sequential rather than Promise.all: a WABA can hold a few hundred
    // templates and this runs behind a user-facing button, not a cron.
    await upsertTemplateStatus(orgId, {
      templateName: entry.name,
      language: entry.language,
      status: entry.status,
      // Meta returns the literal string "NONE" when a template was not rejected.
      reason:
        entry.rejected_reason && entry.rejected_reason.toUpperCase() !== 'NONE'
          ? entry.rejected_reason
          : null,
    }).catch((err) => {
      console.warn('[templateStatus] Skipped one template during refresh', {
        orgId,
        name: entry.name,
        err,
      })
    })
  }

  console.info('[templateStatus] Refreshed statuses from Meta', { orgId, count: entries.length })
  return entries.length
}

/**
 * Has Meta approved this exact template for this org?
 *
 * Used to pick between two registrations of the same message that differ in a
 * way the parameters must match (v3 prints '₪' and takes a bare figure, v4
 * prints nothing and takes formatted money). Guessing wrong renders '₪₪250.00'
 * or a bare '250.00', so the send path asks rather than assumes.
 *
 * Never throws, and answers `false` on any failure: false means "use the older
 * template", which is what every org gets today.
 */
export async function isTemplateApproved(
  orgId: string,
  templateName: string,
  language: string
): Promise<boolean> {
  try {
    const db = createServiceRoleClient()
    const { data, error } = await db
      .from('whatsapp_template_statuses')
      .select('status')
      .eq('organization_id', orgId)
      .eq('template_name', templateName)
      .eq('language', language)
      .maybeSingle()

    if (error) {
      console.warn('[templateStatus] Approval check failed — staying on the older template', {
        orgId,
        templateName,
        error: error.message,
      })
      return false
    }
    return (data as { status?: string } | null)?.status === 'APPROVED'
  } catch (err) {
    console.warn('[templateStatus] Approval check threw — staying on the older template', {
      orgId,
      templateName,
      err,
    })
    return false
  }
}
