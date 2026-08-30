'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { getSession, requireMutation } from '@/lib/auth/session'
import { commonError } from '@/lib/i18n/actionErrors'
import { markAssignmentDone } from '@/lib/homework'
import { setLessonStatus } from '@/app/(dashboard)/lessons/[id]/actions'

export type AttentionActionResult = { error: string | null; chargeAlert?: string }

/**
 * Marks a lesson completed straight from the attention card. Delegates to
 * setLessonStatus so the dashboard tick and the lesson page run the exact same
 * chain: auth gates, status transition, charge creation, auto payment request.
 */
export async function completeLessonFromDashboard(
  lessonId: string
): Promise<AttentionActionResult> {
  const formData = new FormData()
  formData.set('status', 'completed')
  return setLessonStatus(lessonId, { error: null }, formData)
}

export async function markHomeworkDoneFromDashboard(
  assignmentId: string
): Promise<AttentionActionResult> {
  const session = await getSession()
  try {
    requireMutation(session)
  } catch {
    return { error: await commonError('supportModeReadOnly') }
  }
  if (session.role !== 'owner' && session.role !== 'admin') {
    return { error: await commonError('noPermission') }
  }

  try {
    await markAssignmentDone({ assignmentId, organizationId: session.orgId })
  } catch {
    const t = await getTranslations('dashboard')
    return { error: t('attention.markDoneFailed') }
  }

  revalidatePath('/dashboard')
  revalidatePath('/homework')
  revalidatePath(`/homework/${assignmentId}`)
  return { error: null }
}
