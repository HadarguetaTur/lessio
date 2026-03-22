'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth/session'
import { updateLessonStatus, LessonStatus } from '@/lib/lessons'

const VALID_STATUSES: LessonStatus[] = ['scheduled', 'completed', 'no_show', 'cancelled']

export async function setLessonStatus(
  lessonId: string,
  _prevState: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  const { orgId } = await getSession()
  const status = formData.get('status') as LessonStatus
  const cancelReason = (formData.get('cancel_reason') as string) || undefined

  if (!status || !VALID_STATUSES.includes(status)) {
    return { error: 'יש לבחור סטטוס תקין' }
  }

  try {
    await updateLessonStatus(lessonId, orgId, status, cancelReason)
    revalidatePath(`/lessons/${lessonId}`)
    revalidatePath('/lessons')
    revalidatePath('/dashboard')
    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'שגיאה בעדכון הסטטוס' }
  }
}
