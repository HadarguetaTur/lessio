'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getSession, requireMutation } from '@/lib/auth/session'
import { assertOrgNotSaasReadOnly } from '@/lib/saas/featureGate'
import { commonError } from '@/lib/i18n/actionErrors'
import { getTranslations } from 'next-intl/server'
import {
  sendDebtReminderForParent,
  type ReminderOutcome,
} from '@/lib/payment-request/sendManualReminder'
import {
  sendConsolidatedPaymentRequest,
  type ConsolidatedOutcome,
} from '@/lib/payment-request/consolidated'

const parentIdsSchema = z.array(z.string().uuid()).min(1).max(200)

export interface SendRemindersResult {
  error: string | null
  sent: number
  optedOut: number
  skipped: number
  failed: number
}

/**
 * Sends a payment reminder to each selected parent.
 *
 * One parent's failure never stops the rest: outcomes are counted and returned
 * so the UI can say "sent to 7, 2 opted out" instead of a single error toast.
 */
export async function sendDebtRemindersAction(
  parentIds: string[]
): Promise<SendRemindersResult> {
  const session = await getSession()
  requireMutation(session)
  await assertOrgNotSaasReadOnly(session.orgId)

  const empty = { sent: 0, optedOut: 0, skipped: 0, failed: 0 }

  if (session.role !== 'owner' && session.role !== 'admin') {
    return { error: await commonError('noPermission'), ...empty }
  }

  const parsed = parentIdsSchema.safeParse(parentIds)
  if (!parsed.success) return { error: await commonError('invalidData'), ...empty }

  const outcomes = await Promise.all(
    parsed.data.map(async (parentId): Promise<ReminderOutcome> => {
      try {
        return await sendDebtReminderForParent(session.orgId, parentId, session.profileId)
      } catch (err) {
        console.error('[debts] reminder failed', { orgId: session.orgId, parentId, err })
        return 'failed'
      }
    })
  )

  const result = outcomes.reduce(
    (acc, outcome) => {
      if (outcome === 'sent') acc.sent += 1
      else if (outcome === 'opted_out') acc.optedOut += 1
      else if (outcome === 'failed') acc.failed += 1
      else acc.skipped += 1
      return acc
    },
    { ...empty }
  )

  revalidatePath('/billing/debts')
  revalidatePath('/charges')

  // A WhatsApp number that is not connected fails every send, not just one —
  // worth its own message rather than a bare "failed" count.
  if (outcomes.every((o) => o === 'whatsapp_not_connected')) {
    return { error: await commonError('whatsappNotConnected'), ...result }
  }

  return { error: null, ...result }
}

/**
 * Sends one consolidated payment request per selected parent: a single link
 * covering all their open charges, instead of one message per child.
 */
export async function sendConsolidatedRequestsAction(
  parentIds: string[]
): Promise<SendRemindersResult> {
  const session = await getSession()
  requireMutation(session)
  await assertOrgNotSaasReadOnly(session.orgId)

  const empty = { sent: 0, optedOut: 0, skipped: 0, failed: 0 }

  if (session.role !== 'owner' && session.role !== 'admin') {
    return { error: await commonError('noPermission'), ...empty }
  }

  const parsed = parentIdsSchema.safeParse(parentIds)
  if (!parsed.success) return { error: await commonError('invalidData'), ...empty }

  const outcomes = await Promise.all(
    parsed.data.map(async (parentId): Promise<ConsolidatedOutcome> => {
      try {
        return await sendConsolidatedPaymentRequest(session.orgId, parentId, session.profileId)
      } catch (err) {
        console.error('[debts] consolidated request failed', {
          orgId: session.orgId,
          parentId,
          err,
        })
        return 'failed'
      }
    })
  )

  const result = outcomes.reduce(
    (acc, outcome) => {
      if (outcome === 'sent') acc.sent += 1
      else if (outcome === 'opted_out') acc.optedOut += 1
      else if (outcome === 'failed') acc.failed += 1
      else acc.skipped += 1
      return acc
    },
    { ...empty }
  )

  revalidatePath('/billing/debts')
  revalidatePath('/charges')

  // A missing provider or WhatsApp connection fails every parent alike — worth
  // naming rather than reporting as a row of anonymous failures.
  if (outcomes.every((o) => o === 'whatsapp_not_connected')) {
    return { error: await commonError('whatsappNotConnected'), ...result }
  }
  if (outcomes.every((o) => o === 'no_payment_provider')) {
    const t = await getTranslations('debts')
    return { error: t('noPaymentProvider'), ...result }
  }

  return { error: null, ...result }
}
