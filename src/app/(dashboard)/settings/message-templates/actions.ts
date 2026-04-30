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

// ── Schemas ───────────────────────────────────────────────────────────────────

const TemplateSchema = z.object({
  type: z.string().min(1),
  body_template: z.string().min(1, 'תוכן ההודעה לא יכול להיות ריק'),
})

// ── Result types ──────────────────────────────────────────────────────────────

export type ActionState = {
  error: string | null
  success?: boolean
}

// ── saveTemplateAction ────────────────────────────────────────────────────────

/**
 * Upserts a custom template for this org.
 * Uses INSERT ... ON CONFLICT (organization_id, type) DO UPDATE.
 */
export async function saveTemplateAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await getSession()
  requireMutation(session)
  const { orgId, role } = session

  if (role !== 'owner') {
    return { error: 'אין הרשאה לביצוע פעולה זו' }
  }

  await requireFeature(orgId, 'whatsapp_automation')

  const parsed = TemplateSchema.safeParse({
    type: formData.get('type'),
    body_template: String(formData.get('body_template') ?? '').trim(),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' }
  }

  const { type, body_template } = parsed.data

  const db = createServiceRoleClient()
  const { error } = await db
    .from('message_templates')
    .upsert(
      { organization_id: orgId, type, body_template, updated_at: new Date().toISOString() },
      { onConflict: 'organization_id,type' }
    )

  if (error) {
    console.error('[message-templates] Failed to upsert template', { orgId, type, error: error.message })
    return { error: 'שגיאה בשמירת התבנית' }
  }

  console.info('[message-templates] Template saved', { orgId, type })
  revalidatePath('/settings/message-templates')
  return { error: null, success: true }
}

// ── resetTemplateAction ───────────────────────────────────────────────────────

/**
 * Deletes the custom template row — org reverts to system default.
 */
export async function resetTemplateAction(type: string): Promise<{ error?: string }> {
  const session = await getSession()
  requireMutation(session)
  const { orgId, role } = session

  if (role !== 'owner') {
    return { error: 'אין הרשאה לביצוע פעולה זו' }
  }

  await requireFeature(orgId, 'whatsapp_automation')

  const db = createServiceRoleClient()
  const { error } = await db
    .from('message_templates')
    .delete()
    .eq('organization_id', orgId)
    .eq('type', type)

  if (error) {
    console.error('[message-templates] Failed to reset template', { orgId, type, error: error.message })
    return { error: 'שגיאה בבאיפוס התבנית' }
  }

  console.info('[message-templates] Template reset to default', { orgId, type })
  revalidatePath('/settings/message-templates')
  return {}
}
