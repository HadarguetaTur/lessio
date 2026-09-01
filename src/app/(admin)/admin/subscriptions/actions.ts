'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requirePlatformSession } from '@/lib/superadmin/session'
import {
  cancelSubscription,
  changePlan,
  extendTrial,
  setSubscriptionStatus,
  MANUAL_STATUSES,
} from '@/lib/superadmin/subscriptions'
import type { SaasSubscriptionStatus } from '@/lib/saas/types'

/**
 * Subscription mutations for /admin/subscriptions and the org detail screen.
 * Per /docs/sprint-34-scope.md § /admin/subscriptions.
 *
 * Each one re-resolves the superadmin session server-side. The org id arrives
 * from the client, which is fine here and only here: a superadmin is not scoped
 * to an org, so there is no tenant boundary for it to cross.
 */

export type SubscriptionActionState = { error?: string; ok?: boolean }

function revalidate(orgId: string) {
  revalidatePath('/admin/subscriptions')
  revalidatePath('/admin')
  revalidatePath(`/admin/orgs/${orgId}`)
}

const changePlanSchema = z.object({
  orgId: z.string().uuid(),
  planId: z.string().uuid(),
  billingInterval: z.enum(['monthly', 'yearly']),
})

export async function changePlanAction(
  _prev: SubscriptionActionState | null,
  formData: FormData
): Promise<SubscriptionActionState> {
  const { profileId } = await requirePlatformSession('billing.write')

  const parsed = changePlanSchema.safeParse({
    orgId: formData.get('orgId'),
    planId: formData.get('planId'),
    billingInterval: formData.get('billingInterval'),
  })
  if (!parsed.success) return { error: 'INVALID_INPUT' }

  const result = await changePlan({ ...parsed.data, actorProfileId: profileId })
  if (!result.ok) return { error: result.error }

  revalidate(parsed.data.orgId)
  return { ok: true }
}

const extendTrialSchema = z.object({
  orgId: z.string().uuid(),
  days: z.coerce.number().int().min(1).max(365),
})

export async function extendTrialAction(
  _prev: SubscriptionActionState | null,
  formData: FormData
): Promise<SubscriptionActionState> {
  const { profileId } = await requirePlatformSession('billing.write')

  const parsed = extendTrialSchema.safeParse({
    orgId: formData.get('orgId'),
    days: formData.get('days'),
  })
  if (!parsed.success) return { error: 'INVALID_INPUT' }

  const result = await extendTrial({ ...parsed.data, actorProfileId: profileId })
  if (!result.ok) return { error: result.error }

  revalidate(parsed.data.orgId)
  return { ok: true }
}

const statusSchema = z.object({
  orgId: z.string().uuid(),
  status: z.enum(MANUAL_STATUSES as [SaasSubscriptionStatus, ...SaasSubscriptionStatus[]]),
})

export async function setSubscriptionStatusAction(
  _prev: SubscriptionActionState | null,
  formData: FormData
): Promise<SubscriptionActionState> {
  const { profileId } = await requirePlatformSession('billing.write')

  const parsed = statusSchema.safeParse({
    orgId: formData.get('orgId'),
    status: formData.get('status'),
  })
  if (!parsed.success) return { error: 'INVALID_INPUT' }

  const result = await setSubscriptionStatus({ ...parsed.data, actorProfileId: profileId })
  if (!result.ok) return { error: result.error }

  revalidate(parsed.data.orgId)
  return { ok: true }
}

const cancelSchema = z.object({
  orgId: z.string().uuid(),
  atPeriodEnd: z.enum(['true', 'false']),
})

export async function cancelSubscriptionAction(
  _prev: SubscriptionActionState | null,
  formData: FormData
): Promise<SubscriptionActionState> {
  const { profileId } = await requirePlatformSession('billing.write')

  const parsed = cancelSchema.safeParse({
    orgId: formData.get('orgId'),
    atPeriodEnd: formData.get('atPeriodEnd'),
  })
  if (!parsed.success) return { error: 'INVALID_INPUT' }

  const result = await cancelSubscription({
    orgId: parsed.data.orgId,
    atPeriodEnd: parsed.data.atPeriodEnd === 'true',
    actorProfileId: profileId,
  })
  if (!result.ok) return { error: result.error }

  revalidate(parsed.data.orgId)
  return { ok: true }
}
