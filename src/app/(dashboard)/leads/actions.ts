'use server'

import { revalidatePath } from 'next/cache'
import { getSession, requireMutation } from '@/lib/auth/session'
import { requireFeature } from '@/lib/saas/featureGate'
import { updateLeadStatus as libUpdateLeadStatus, updateLeadNotes as libUpdateLeadNotes, LeadStatus } from '@/lib/leads'
import { commonError, zodError } from '@/lib/i18n/actionErrors'
import { getTranslations } from 'next-intl/server'

export async function updateLeadStatus(
  leadId: string,
  status: LeadStatus
): Promise<{ error: string | null }> {
  const t = await getTranslations()
  const session = await getSession()
  const { orgId, role } = session
  requireMutation(session)

  if (role !== 'owner' && role !== 'admin') {
    return { error: await commonError('noPermission') }
  }

  await requireFeature(orgId, 'leads')

  if (status === 'converted') {
    return { error: t('leads.errors.cannotSetConverted') }
  }

  try {
    await libUpdateLeadStatus(leadId, orgId, status)
    revalidatePath('/leads')
    return { error: null }
  } catch {
    return { error: t('leads.errors.updateStatusFailed') }
  }
}

export async function saveLeadNotes(
  leadId: string,
  notes: string
): Promise<{ error: string | null }> {
  const t = await getTranslations()
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
    return { error: t('leads.errors.saveNotesFailed') }
  }
}
