import { cache } from 'react'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

/**
 * Whether the "send the parent a WhatsApp confirmation" box starts checked in
 * the mark-as-paid dialogs.
 *
 * A default only: the box is still shown (whenever there is a phone to message)
 * and staff may flip it on any single payment. Wrapped in `cache` because the
 * charges page renders several dialogs per request and they all want the same
 * answer.
 *
 * A read failure returns `true` — the historical hard-coded behaviour — rather
 * than throwing. Getting this wrong sends one extra message the org can see and
 * correct; taking the billing page down over it is worse.
 */
export const getPaymentConfirmationDefault = cache(async (orgId: string): Promise<boolean> => {
  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('organizations')
    .select('payment_confirmation_default_enabled')
    .eq('id', orgId)
    .maybeSingle()

  if (error) {
    console.error('[paymentNotification] Failed to load the confirmation default — assuming on', {
      orgId,
      error: error.message,
    })
    return true
  }

  return data?.payment_confirmation_default_enabled ?? true
})
