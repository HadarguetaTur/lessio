'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getSession } from '@/lib/auth/session'
import { convertLead } from '@/lib/leads/convertLead'
import { requireFeature } from '@/lib/saas/featureGate'

const convertLeadSchema = z.object({
  leadId: z.string().uuid(),
  parentFullName: z.string().trim().min(1, 'שם הורה הוא שדה חובה').max(120),
  studentFullName: z.string().trim().min(1, 'שם תלמיד הוא שדה חובה').max(120),
  grade: z.string().trim().max(40).optional(),
})

export async function convertLeadAction(
  leadId: string,
  parentFullName: string,
  studentFullName: string,
  grade: string
): Promise<{ error: string | null }> {
  const { orgId, role } = await getSession()

  if (role !== 'owner' && role !== 'admin') {
    return { error: 'אין הרשאה לביצוע פעולה זו' }
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
      return { error: 'שם הורה הוא שדה חובה' }
    }
    if (firstIssue?.path[0] === 'studentFullName') {
      return { error: 'שם תלמיד הוא שדה חובה' }
    }

    return { error: 'פרטי ההמרה אינם תקינים' }
  }

  try {
    await convertLead(parsed.data.leadId, orgId, {
      parentFullName: parsed.data.parentFullName,
      studentFullName: parsed.data.studentFullName,
      grade: parsed.data.grade,
    })
    revalidatePath('/leads')
    revalidatePath('/parents')
    revalidatePath('/students')
    return { error: null }
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (msg.includes('already exists as a parent')) {
      return { error: 'מספר הטלפון כבר רשום כהורה במערכת' }
    }
    if (msg.includes('already converted')) {
      return { error: 'הליד כבר הומר' }
    }
    return { error: 'שגיאה בהמרת הליד' }
  }
}
