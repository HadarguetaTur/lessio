'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getSession, requireMutation } from '@/lib/auth/session'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import {
  COVERABLE_LESSON_TYPES,
  createPackProduct,
  updatePackProduct,
  type CoveredLessonType,
} from '@/lib/billing/packs/products'

type ActionState = { error: string } | { success: true } | null

const PolicySchema = z
  .object({
    notice_hours_full: z.coerce.number().int().min(0),
    notice_hours_partial: z.coerce.number().int().min(0),
    partial_charge_percent: z.coerce.number().int().min(0).max(100),
    no_show_charge_percent: z.coerce.number().int().min(0).max(100),
    no_show_pack_action: z.enum(['consume', 'charge']),
    late_cancel_pack_action: z.enum(['consume', 'charge']),
    pack_activation: z.enum(['immediate', 'on_payment']),
    pack_scope: z.enum(['student', 'family']),
    pack_low_balance_threshold: z.coerce.number().int().min(0).max(100),
    pack_notifications_enabled: z.boolean(),
    pack_collection_enabled: z.boolean(),
  })
  .refine((v) => v.notice_hours_partial < v.notice_hours_full, { path: ['notice_hours_partial'], message: 'partialLessThanFull' })

/** Which existing message explains a failed field. */
const FIELD_ERROR: Record<string, string> = {
  notice_hours_full: 'fullHoursPositive',
  notice_hours_partial: 'partialHoursPositive',
  partial_charge_percent: 'percentRange',
  no_show_charge_percent: 'noShowPercentRange',
  pack_low_balance_threshold: 'thresholdRange',
}

/**
 * Cancellations, no-shows and punch cards — one policy, one page (decision #46).
 * Fields a form does not send keep their defaults, so an older client that
 * only posts the cancellation window cannot switch the new rules off.
 */
export async function updateCancellationPolicy(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const t = await getTranslations()
  const session = await getSession()
  requireMutation(session)
  const { orgId, role } = session

  if (role !== 'owner') {
    return { error: t('settings.cancellationPolicy.errors.ownerOnly') }
  }

  const field = (name: string, fallback: string) => {
    const value = formData.get(name)
    return value == null || value === '' ? fallback : String(value)
  }
  const parsed = PolicySchema.safeParse({
    notice_hours_full: formData.get('notice_hours_full'),
    notice_hours_partial: formData.get('notice_hours_partial'),
    partial_charge_percent: formData.get('partial_charge_percent'),
    no_show_charge_percent: field('no_show_charge_percent', '0'),
    no_show_pack_action: field('no_show_pack_action', 'consume'),
    late_cancel_pack_action: field('late_cancel_pack_action', 'consume'),
    pack_activation: field('pack_activation', 'immediate'),
    pack_scope: field('pack_scope', 'student'),
    pack_low_balance_threshold: field('pack_low_balance_threshold', '2'),
    pack_notifications_enabled: formData.get('pack_notifications_enabled') === 'on',
    pack_collection_enabled: formData.get('pack_collection_enabled') === 'on',
  })

  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const key =
      issue?.message === 'partialLessThanFull'
        ? 'partialLessThanFull'
        : FIELD_ERROR[String(issue?.path[0])] ?? 'saveFailed'
    return { error: t(`settings.cancellationPolicy.errors.${key}`) }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('cancellation_policies').upsert(
    {
      organization_id: orgId,
      ...parsed.data,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'organization_id' }
  )

  if (error) return { error: t('settings.cancellationPolicy.errors.saveFailed') }

  revalidatePath('/settings/cancellation-policy')
  return { success: true }
}

// ── Catalog ─────────────────────────────────────────────────────────────────

const ProductSchema = z.object({
  name: z.string().trim().min(1).max(80),
  credits: z.coerce.number().int().min(1).max(500),
  price: z.coerce.number().min(0).max(100000),
  covered_lesson_types: z.array(z.enum(COVERABLE_LESSON_TYPES as [CoveredLessonType, ...CoveredLessonType[]])).min(1),
  validity_days: z.union([z.literal(''), z.coerce.number().int().min(1).max(3650)]),
})

async function requireOwner(): Promise<{ orgId: string } | { error: string }> {
  const t = await getTranslations()
  const session = await getSession()
  requireMutation(session)
  if (session.role !== 'owner') return { error: t('settings.cancellationPolicy.errors.ownerOnly') }
  return { orgId: session.orgId }
}

function parseProduct(formData: FormData) {
  return ProductSchema.safeParse({
    name: formData.get('name'),
    credits: formData.get('credits'),
    price: formData.get('price'),
    covered_lesson_types: formData.getAll('covered_lesson_types').map(String),
    validity_days: String(formData.get('validity_days') ?? ''),
  })
}

export async function savePackProductAction(
  productId: string | null,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const t = await getTranslations()
  const owner = await requireOwner()
  if ('error' in owner) return owner

  const parsed = parseProduct(formData)
  if (!parsed.success) {
    const field = String(parsed.error.issues[0]?.path[0] ?? '')
    return { error: t(`settings.packs.errors.${field === 'covered_lesson_types' ? 'typesRequired' : field === 'name' ? 'nameRequired' : 'invalidNumbers'}`) }
  }
  const input = {
    ...parsed.data,
    validity_days: parsed.data.validity_days === '' ? null : parsed.data.validity_days,
  }
  const result = productId
    ? await updatePackProduct(owner.orgId, productId, input)
    : await createPackProduct(owner.orgId, input)
  if (!result.ok) return { error: t('settings.packs.errors.saveFailed') }

  revalidatePath('/settings/cancellation-policy')
  return { success: true }
}

export async function setPackProductActiveAction(productId: string, active: boolean): Promise<ActionState> {
  const t = await getTranslations()
  const owner = await requireOwner()
  if ('error' in owner) return owner
  const result = await updatePackProduct(owner.orgId, productId, { is_active: active })
  if (!result.ok) return { error: t('settings.packs.errors.saveFailed') }
  revalidatePath('/settings/cancellation-policy')
  return { success: true }
}
