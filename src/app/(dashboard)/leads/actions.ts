'use server'

import { revalidatePath } from 'next/cache'
import { getSession, requireMutation } from '@/lib/auth/session'
import { requireFeature } from '@/lib/saas/featureGate'
import { updateLeadStatus as libUpdateLeadStatus, updateLeadNotes as libUpdateLeadNotes, LeadStatus } from '@/lib/leads'
import { commonError } from '@/lib/i18n/actionErrors'

export async function updateLeadStatus(
  leadId: string,
  status: LeadStatus
): Promise<{ error: string | null }> {
  const session = await getSession()
  const { orgId, role } = session
  requireMutation(session)

  if (role !== 'owner' && role !== 'admin') {
    return { error: await commonError('noPermission') }
  }

  await requireFeature(orgId, 'leads')

  if (status === 'converted') {
    return { error: 'לא ניתן לשנות סטטוס ל"הומר" באופן ידני' }
  }

  try {
    await libUpdateLeadStatus(leadId, orgId, status)
    revalidatePath('/leads')
    return { error: null }
  } catch {
    return { error: 'שגיאה בעדכון סטטוס הליד' }
  }
}

export async function saveLeadNotes(
  leadId: string,
  notes: string
): Promise<{ error: string | null }> {
  const session = await getSession()
  const { orgId, role } = session
  requireMutation(session)

  if (role !== 'owner' && role !== 'admin') {
    return { error: await commonError('noPermission') }
  }

  await requireFeature(orgId, 'leads')

  try {
    await libUpdateLeadNotes(leadId, orgId, notes.trim())
    revalidatePath('/leads')
    return { error: null }
  } catch {
    return { error: 'שגיאה בשמירת ההערות' }
  }
}
