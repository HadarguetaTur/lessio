'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth/session'
import { updateLessonStatus, LessonStatus } from '@/lib/lessons'
import { createLessonCharge, createCancellationCharge } from '@/lib/billing/createCharge'
import { getCancellationPolicy } from '@/lib/cancellation-policy'
import { calculateCancellationCharge } from '@/lib/billing/calculateCancellationCharge'
import { resolveBillingParent, MissingPrimaryParentError } from '@/lib/billing/resolveBillingParent'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

const VALID_STATUSES: LessonStatus[] = ['scheduled', 'completed', 'no_show', 'cancelled']

export type SetLessonStatusResult = {
  error: string | null
  chargeAlert?: string
}

export async function setLessonStatus(
  lessonId: string,
  _prevState: SetLessonStatusResult,
  formData: FormData
): Promise<SetLessonStatusResult> {
  const { orgId, role } = await getSession()

  if (role !== 'owner' && role !== 'admin') {
    return { error: 'אין הרשאה לביצוע פעולה זו' }
  }

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
    revalidatePath('/teacher/schedule')
    revalidatePath(`/teacher/schedule/${lessonId}`)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'שגיאה בעדכון הסטטוס' }
  }

  // Automatic charge creation on completed
  if (status === 'completed') {
    const alert = await createLessonCharge(lessonId, orgId)
    if (alert) {
      return { error: null, chargeAlert: alert.message }
    }
  }

  return { error: null }
}

export type CancelLessonResult = {
  error: string | null
  chargeAlert?: string
}

/**
 * Cancels a lesson from the dashboard (owner/admin only).
 * Calculates charge via policy engine. Charge is skipped if waive=true.
 * Cannot cancel an already-cancelled lesson.
 */
export async function cancelLesson(
  lessonId: string,
  _prevState: CancelLessonResult,
  formData: FormData
): Promise<CancelLessonResult> {
  const { orgId, role } = await getSession()

  if (role !== 'owner' && role !== 'admin') {
    return { error: 'אין הרשאה לביטול שיעורים' }
  }

  const reason = (formData.get('cancel_reason') as string).trim()
  if (!reason) return { error: 'יש להזין סיבת ביטול' }

  const waive = formData.get('waive') === 'true'

  const supabase = createServiceRoleClient()

  // Fetch lesson with teacher hourly_rate; student resolved via lesson_students
  const { data: lesson, error: lessonError } = await supabase
    .from('lessons')
    .select('id, start_at, end_at, status, lesson_students(student_id), teachers(id, hourly_rate)')
    .eq('id', lessonId)
    .eq('organization_id', orgId)
    .single()

  if (lessonError || !lesson) return { error: 'שיעור לא נמצא' }
  if (lesson.status === 'cancelled') return { error: 'השיעור כבר בוטל' }

  const lessonStudents = (lesson.lesson_students as Array<{ student_id: string }>)
  const primaryStudentId = lessonStudents[0]?.student_id

  // Determine charge
  let chargeAlert: string | undefined
  let cancellationParentId: string | null = null
  let pendingCancellationCharge:
    | ReturnType<typeof calculateCancellationCharge>
    | null = null

  if (!waive) {
    const policy = await getCancellationPolicy(orgId)
    const teacher = (lesson.teachers as unknown as { id: string; hourly_rate: number | null })

    const chargeResult = calculateCancellationCharge(
      { start_at: lesson.start_at, end_at: lesson.end_at, hourly_rate: teacher.hourly_rate },
      new Date(),
      policy
    )

    if (chargeResult.shouldCharge && chargeResult.amount > 0) {
      pendingCancellationCharge = chargeResult
      if (!primaryStudentId) {
        chargeAlert = 'לא ניתן ליצור חיוב ביטול — לשיעור אין תלמידים מקושרים'
      } else {
        try {
          cancellationParentId = await resolveBillingParent(primaryStudentId, orgId)
        } catch (e) {
          if (e instanceof MissingPrimaryParentError) {
            chargeAlert = 'לא ניתן ליצור חיוב ביטול — לתלמיד אין הורה ראשי מוגדר'
          } else {
            chargeAlert = 'שגיאה ביצירת חיוב הביטול'
          }
        }
      }
    } else if (chargeResult.shouldCharge && chargeResult.reasonCode === 'missing_rate') {
      chargeAlert = 'לא ניתן ליצור חיוב ביטול — למורה אין תעריף שעתי מוגדר'
    }
  }

  // Update lesson status
  const { error: updateError } = await supabase
    .from('lessons')
    .update({ status: 'cancelled', cancel_reason: reason, updated_at: new Date().toISOString() })
    .eq('id', lessonId)
    .eq('organization_id', orgId)

  if (updateError) return { error: 'שגיאה בביטול השיעור' }

  if (pendingCancellationCharge && cancellationParentId) {
    const alert = await createCancellationCharge(
      lessonId,
      orgId,
      cancellationParentId,
      pendingCancellationCharge
    )
    if (alert) chargeAlert = alert.message
  }

  revalidatePath(`/lessons/${lessonId}`)
  revalidatePath('/lessons')
  revalidatePath('/dashboard')
  revalidatePath('/charges')
  revalidatePath('/teacher/schedule')
  revalidatePath(`/teacher/schedule/${lessonId}`)

  return { error: null, chargeAlert }
}
