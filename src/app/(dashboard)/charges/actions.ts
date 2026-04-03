'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth/session'
import { markChargeAsPaid } from '@/lib/charges'
import { issueReceiptForCharge } from '@/lib/receipts/issueReceiptForCharge'

export async function markAsPaid(
  chargeId: string,
  notes?: string
): Promise<{ error: string | null }> {
  const { orgId, role } = await getSession()

  if (role !== 'owner' && role !== 'admin') {
    return { error: 'אין הרשאה לביצוע פעולה זו' }
  }

  try {
    await markChargeAsPaid(chargeId, orgId, notes?.trim() || undefined)
    revalidatePath('/charges')
    revalidatePath('/parents')
  } catch {
    return { error: 'שגיאה בעדכון סטטוס החיוב' }
  }

  // Fire-and-forget receipt issuance — must not block or fail the mark-paid response
  issueReceiptForCharge(chargeId, orgId).catch((err) => {
    console.error('[charges] receipt issuance failed — charge already marked paid', {
      chargeId,
      orgId,
      err,
    })
  })

  return { error: null }
}
