'use server'

/**
 * The "verification & trust" card on /settings/whatsapp (broadcasts Phase 0.4).
 *
 * Meta does not let a tech provider upload Business Verification documents on a
 * customer's behalf — only an authorised person of the business, in Security
 * Centre. So this card never collects documents. It refreshes what Meta says
 * about the number, and lets the owner tick off the preparation steps so the
 * page shows where they stand when they come back.
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getSession, requireMutation } from '@/lib/auth/session'
import { mutationBlockedError } from '@/lib/i18n/actionErrors'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { refreshPhoneHealth } from '@/lib/whatsapp/health'
import { getTranslations } from 'next-intl/server'
import { VERIFICATION_CHECKLIST_IDS } from '@/lib/whatsapp/verificationChecklist'

export type TrustActionResult = { error: string | null }


export async function refreshWhatsAppHealth(
  _prev: TrustActionResult,
  _formData: FormData
): Promise<TrustActionResult> {
  const session = await getSession()
  try {
    requireMutation(session)
  } catch (err) {
    return { error: await mutationBlockedError(err) }
  }
  const t = await getTranslations('settings.whatsappTrust')

  if (session.role !== 'owner') return { error: t('errors.ownerOnly') }

  const result = await refreshPhoneHealth(session.orgId)

  // Three different sentences, not one. The old code reported "we could not
  // reach Meta" for an org that had simply never connected a number, and said
  // nothing at all about a dead token (UX audit F12).
  if (!result.ok) {
    revalidatePath('/settings/whatsapp')
    return { error: t(`errors.refresh.${result.reason}`) }
  }

  revalidatePath('/settings/whatsapp')
  return { error: null }
}

const ToggleSchema = z.object({
  item: z.enum(VERIFICATION_CHECKLIST_IDS),
  checked: z.enum(['on', 'off']).transform((v) => v === 'on'),
})

export async function toggleVerificationChecklistItem(
  _prev: TrustActionResult,
  formData: FormData
): Promise<TrustActionResult> {
  const session = await getSession()
  try {
    requireMutation(session)
  } catch (err) {
    return { error: await mutationBlockedError(err) }
  }
  const t = await getTranslations('settings.whatsappTrust')

  if (session.role !== 'owner') return { error: t('errors.ownerOnly') }

  const parsed = ToggleSchema.safeParse({
    item: formData.get('item'),
    checked: formData.get('checked') ?? 'off',
  })
  if (!parsed.success) return { error: t('errors.invalid') }

  const db = createServiceRoleClient()
  const { data: org } = await db
    .from('organizations')
    .select('wa_verification_checklist')
    .eq('id', session.orgId)
    .maybeSingle()

  const current = (org?.wa_verification_checklist ?? {}) as Record<string, string>
  const next = { ...current }
  if (parsed.data.checked) next[parsed.data.item] = new Date().toISOString()
  else delete next[parsed.data.item]

  const { error } = await db
    .from('organizations')
    .update({ wa_verification_checklist: next })
    .eq('id', session.orgId)

  if (error) {
    console.error('[whatsapp/trust] Checklist update failed', { orgId: session.orgId, error: error.message })
    return { error: t('errors.saveFailed') }
  }

  revalidatePath('/settings/whatsapp')
  return { error: null }
}
