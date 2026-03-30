'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getSession } from '@/lib/auth/session'
import { createLessonSeries } from '@/lib/lessons/createSeries'

const SeriesFormSchema = z.object({
  teacher_id: z.string().uuid(),
  student_id: z.string().uuid(),
  day_of_week: z.coerce.number().int().min(0).max(6),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  duration_minutes: z.coerce.number().int().positive(),
  frequency: z.enum(['weekly', 'biweekly']),
  until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

export type CreateSeriesState = {
  error: string | null
  result?: {
    seriesId: string
    created: number
    skipped: number
    conflicts: string[]
  }
}

export async function createSeriesAction(
  _prevState: CreateSeriesState,
  formData: FormData
): Promise<CreateSeriesState> {
  const { orgId, role, userId } = await getSession()

  if (role !== 'owner' && role !== 'admin') {
    return { error: 'אין הרשאה לביצוע פעולה זו' }
  }

  const parsed = SeriesFormSchema.safeParse({
    teacher_id: formData.get('teacher_id'),
    student_id: formData.get('student_id'),
    day_of_week: formData.get('day_of_week'),
    start_time: formData.get('start_time'),
    duration_minutes: formData.get('duration_minutes'),
    frequency: formData.get('frequency'),
    until: formData.get('until'),
  })

  if (!parsed.success) {
    const firstError = parsed.error.issues[0]
    return { error: firstError?.message ?? 'נתונים לא תקינים' }
  }

  const { teacher_id, student_id, day_of_week, start_time, duration_minutes, frequency, until } =
    parsed.data

  // Validate until is in the future
  const todayStr = new Date().toISOString().substring(0, 10)
  if (until <= todayStr) {
    return { error: 'תאריך הסיום חייב להיות בעתיד' }
  }

  try {
    const result = await createLessonSeries({
      orgId,
      teacherId: teacher_id,
      studentId: student_id,
      rule: { frequency, day_of_week, start_time, duration_minutes, until },
      createdByProfileId: userId,
    })

    revalidatePath('/lessons')

    return { error: null, result }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'שגיאה ביצירת הסדרה' }
  }
}
