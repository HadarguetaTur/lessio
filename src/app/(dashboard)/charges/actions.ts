'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth/session'
import { markChargeAsPaid } from '@/lib/charges'

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
    return { error: null }
  } catch {
    return { error: 'שגיאה בעדכון סטטוס החיוב' }
  }
}
