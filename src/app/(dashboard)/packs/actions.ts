'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { getSession, requireMutation } from '@/lib/auth/session'
import { canAccessStudent } from '@/lib/auth/studentAccess'
import { commonError } from '@/lib/i18n/actionErrors'
import { runAfterResponse } from '@/lib/server/afterResponse'
import { sellPack } from '@/lib/billing/packs/sell'
import {
  adjustPackBalance,
  cancelPack,
  getStudentPacks,
  updatePack,
  type PackListItem,
} from '@/lib/billing/packs/manage'
import { listPackProducts, type PackProduct } from '@/lib/billing/packs/products'
import { toPackSummary, type PackSummary } from '@/lib/billing/packs/summary'
import { getCollectionPolicyServiceRole } from '@/lib/cancellation-policy/service'
import { getOrgBillingPolicy } from '@/lib/billing/orgBillingPolicy'
import { autoSendPaymentRequestForCharge } from '@/lib/payment-request/autoSend'

export type PackActionResult = { error: string | null; force?: boolean }

export type StudentPacksData =
  | {
      mode: 'full'
      packs: PackListItem[]
      products: PackProduct[]
      packScope: 'student' | 'family'
      packActivation: 'immediate' | 'on_payment'
      billingMode: 'monthly' | 'per_lesson'
      isOwner: boolean
      lowBalanceThreshold: number
    }
  /** Teacher / office manager: a balance, never money (plan amendment §4). */
  | { mode: 'summary'; packs: PackSummary[] }

function revalidatePacks() {
  revalidatePath('/packs')
  revalidatePath('/charges')
  revalidatePath('/students')
  revalidatePath('/billing')
}

export async function fetchStudentPacksAction(
  studentId: string
): Promise<{ data: StudentPacksData } | { error: string }> {
  const session = await getSession()
  if (!(await canAccessStudent(session, studentId))) return { error: await commonError('noPermission') }
  const t = await getTranslations('packs')

  try {
    const packs = await getStudentPacks(session.orgId, studentId)
    if (session.role !== 'owner' && session.role !== 'admin') {
      return {
        data: {
          mode: 'summary',
          packs: packs.filter((p) => p.status !== 'cancelled' && p.status !== 'pending_payment').map(toPackSummary),
        },
      }
    }
    const [products, collection, billing] = await Promise.all([
      listPackProducts(session.orgId, { activeOnly: true }),
      getCollectionPolicyServiceRole(session.orgId),
      getOrgBillingPolicy(session.orgId),
    ])
    return {
      data: {
        mode: 'full',
        packs,
        products,
        packScope: collection.packScope,
        packActivation: collection.packActivation,
        billingMode: billing.billingMode,
        isOwner: session.role === 'owner',
        lowBalanceThreshold: collection.packLowBalanceThreshold,
      },
    }
  } catch (err) {
    console.error('[packs/actions] fetch failed', { studentId, err })
    return { error: t('errors.failed') }
  }
}

/** Owner/admin — selling a card is a money decision. */
async function requireBillingManager() {
  const session = await getSession()
  requireMutation(session)
  const profileId = session.profileId
  if ((session.role !== 'owner' && session.role !== 'admin') || !profileId) {
    return { error: await commonError('noPermission') } as const
  }
  return { session, profileId } as const
}

const SellSchema = z.object({
  studentId: z.string().min(1),
  productId: z.string().min(1),
  scope: z.enum(['student', 'family']).optional(),
  priceOverride: z.number().min(0).max(100000).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
})

export async function sellPackAction(input: z.input<typeof SellSchema>): Promise<PackActionResult> {
  const auth = await requireBillingManager()
  if ('error' in auth) return { error: auth.error ?? null }
  const { session } = auth
  const t = await getTranslations('packs')

  const parsed = SellSchema.safeParse(input)
  if (!parsed.success) return { error: t('errors.failed') }
  if (!(await canAccessStudent(session, parsed.data.studentId))) return { error: await commonError('noPermission') }

  const result = await sellPack({
    organizationId: session.orgId,
    productId: parsed.data.productId,
    studentId: parsed.data.studentId,
    scope: parsed.data.scope,
    // Changing the catalog price is the owner's call.
    priceOverride: session.role === 'owner' ? parsed.data.priceOverride ?? null : null,
    notes: parsed.data.notes ?? null,
    actorProfileId: auth.profileId,
  })
  if (!result.ok) return { error: t(`errors.${result.reason}`) }

  if (result.chargeId) {
    await runAfterResponse(autoSendPaymentRequestForCharge(result.chargeId, session.orgId))
  }
  revalidatePacks()
  return { error: null }
}

const CancelSchema = z.object({
  packId: z.string().min(1),
  reason: z.string().trim().min(1).max(500),
  force: z.boolean().optional(),
})

export async function cancelPackAction(input: z.input<typeof CancelSchema>): Promise<PackActionResult> {
  const auth = await requireBillingManager()
  if ('error' in auth) return { error: auth.error ?? null }
  const { session } = auth
  const t = await getTranslations('packs')

  const parsed = CancelSchema.safeParse(input)
  if (!parsed.success) return { error: t('errors.reason_required') }

  const result = await cancelPack({
    organizationId: session.orgId,
    packId: parsed.data.packId,
    actorProfileId: auth.profileId,
    role: session.role,
    reason: parsed.data.reason,
    force: parsed.data.force,
  })
  if (!result.ok) {
    return {
      error: t(`errors.${result.reason}`),
      // Tells the UI to offer "cancel anyway" — to the owner only.
      force: result.reason === 'paid_not_refunded' && session.role === 'owner',
    }
  }
  revalidatePacks()
  return { error: null }
}

const AdjustSchema = z.object({
  packId: z.string().min(1),
  delta: z.number().int(),
  reason: z.string().trim().min(1).max(500),
})

export async function adjustPackAction(input: z.input<typeof AdjustSchema>): Promise<PackActionResult> {
  const auth = await requireBillingManager()
  if ('error' in auth) return { error: auth.error ?? null }
  const { session } = auth
  const t = await getTranslations('packs')

  const parsed = AdjustSchema.safeParse(input)
  if (!parsed.success) return { error: t('errors.invalid_delta') }

  const result = await adjustPackBalance({
    organizationId: session.orgId,
    packId: parsed.data.packId,
    delta: parsed.data.delta,
    reason: parsed.data.reason,
    actorProfileId: auth.profileId,
  })
  if (!result.ok) return { error: t(`errors.${result.reason}`) }
  revalidatePacks()
  return { error: null }
}

const UpdateSchema = z.object({
  packId: z.string().min(1),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  notes: z.string().max(500).nullable(),
})

export async function updatePackAction(input: z.input<typeof UpdateSchema>): Promise<PackActionResult> {
  const auth = await requireBillingManager()
  if ('error' in auth) return { error: auth.error ?? null }
  const { session } = auth
  const t = await getTranslations('packs')

  const parsed = UpdateSchema.safeParse(input)
  if (!parsed.success) return { error: t('errors.invalid_dates') }

  const result = await updatePack({
    organizationId: session.orgId,
    packId: parsed.data.packId,
    validUntil: parsed.data.validUntil,
    notes: parsed.data.notes,
  })
  if (!result.ok) return { error: t(`errors.${result.reason}`) }
  revalidatePacks()
  return { error: null }
}
