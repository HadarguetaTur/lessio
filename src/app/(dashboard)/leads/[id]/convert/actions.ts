'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getSession, requireMutation } from '@/lib/auth/session'
import { convertLead } from '@/lib/leads/convertLead'
import { recordParentConsent } from '@/lib/whatsapp/consent'
import { requireFeature } from '@/lib/saas/featureGate'
import { commonError, zodError } from '@/lib/i18n/actionErrors'
import { getTranslations } from 'next-intl/server'

const convertLeadSchema = z.object({
  leadId: z.string().uuid(),
  parentFullName: z.string().trim().min(1, 'validation.parentNameRequired').max(120),
  studentFullName: z.string().trim().min(1, 'validation.studentNameRequired').max(120),
  grade: z.string().trim().max(40).optional(),
})

export async function convertLeadAction(
  leadId: string,
  parentFullName: string,
  studentFullName: string,
  grade: string,
  whatsappConsent: boolean = false
): Promise<{ error: string | null }> {
  const t = await getTranslations()
  const session = await getSession()
  const { orgId, role, userId } = session
  requireMutation(session)

  if (role !== 'owner' && role !== 'admin') {
    return { error: await commonError('noPermission') }
  }

  await requireFeature(orgId, 'leads')

  const parsed = convertLeadSchema.safeParse({
    leadId,
    parentFullName,
    studentFullName,
    grade: grade.trim() || undefined,
  })

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    if (firstIssue?.path[0] === 'parentFullName') {
      return { error: 'validation.parentNameRequired' }
    }
    if (firstIssue?.path[0] === 'studentFullName') {
      return { error: 'validation.studentNameRequired' }
    }

    return { error: t('leads.errors.invalidConversion') }
  }

  try {
    const { parentId } = await convertLead(parsed.data.leadId, orgId, {
      parentFullName: parsed.data.parentFullName,
      studentFullName: parsed.data.studentFullName,
      grade: parsed.data.grade,
    })
    // A lead became a lead by writing to the business number, so the parent
    // row is born with implicit opt-in; the checkbox records an explicit one.
    await recordParentConsent({
      parentId,
      source: whatsappConsent ? 'attested' : 'whatsapp_reply',
      consentedBy: whatsappConsent ? userId : null,
      markWelcomeSent: !whatsappConsent,
    })
    revalidatePath('/leads')
    revalidatePath('/parents')
    revalidatePath('/students')
    return { error: null }
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (msg.includes('already exists as a parent')) {
      return { error: t('leads.errors.phoneAlreadyParent') }
    }
    if (msg.includes('already converted')) {
      return { error: t('leads.errors.alreadyConverted') }
    }
    return { error: t('leads.errors.convertFailed') }
  }
}
