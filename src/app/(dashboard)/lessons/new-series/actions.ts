'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getSession, requireMutation } from '@/lib/auth/session'
import { createLessonSeries } from '@/lib/lessons/createSeries'
import {
  extendLessonSeries,
  shortenLessonSeries,
  deleteLessonSeries,
} from '@/lib/lessons/updateSeries'
import { commonError, zodError } from '@/lib/i18n/actionErrors'
import { getTranslations } from 'next-intl/server'

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
  const t = await getTranslations()
  const session = await getSession()
  const { orgId, role, userId } = session
  requireMutation(session)

  if (role !== 'owner' && role !== 'admin') {
    return { error: await commonError('noPermission') }
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
    return { error: firstError?.message ?? await commonError('invalidData') }
  }

  const { teacher_id, student_id, day_of_week, start_time, duration_minutes, frequency, until } =
    parsed.data

  // Validate until is in the future
  const todayStr = new Date().toISOString().substring(0, 10)
  if (until <= todayStr) {
    return { error: t('lessons.seriesErrors.endDateFuture') }
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
    return { error: t('lessons.seriesErrors.createSeriesFailed') }
  }
}

// ── Series management (existing-series list) ──────────────────────────────────

export type SeriesManageState = {
  error: string | null
  /** Lessons created (extend) or cancelled (shorten / delete). */
  affected?: number
  action?: 'extended' | 'shortened' | 'deleted'
}

const UntilSchema = z.object({
  series_id: z.string().uuid(),
  until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

/** Extends or shortens a series to a new end date, whichever way it moved. */
export async function updateSeriesUntilAction(
  _prevState: SeriesManageState,
  formData: FormData
): Promise<SeriesManageState> {
  const t = await getTranslations()
  const session = await getSession()
  requireMutation(session)
  if (session.role !== 'owner' && session.role !== 'admin') {
    return { error: await commonError('noPermission') }
  }

  const parsed = UntilSchema.safeParse({
    series_id: formData.get('series_id'),
    until: formData.get('until'),
  })
  if (!parsed.success) return { error: await commonError('invalidData') }
  const { series_id, until } = parsed.data

  const currentUntil = String(formData.get('current_until') ?? '')
  const todayStr = new Date().toISOString().substring(0, 10)
  if (until <= todayStr) {
    return { error: t('lessons.seriesErrors.endDateFuture') }
  }

  try {
    const extending = !currentUntil || until >= currentUntil
    const { affected } = extending
      ? await extendLessonSeries(series_id, session.orgId, until)
      : await shortenLessonSeries(series_id, session.orgId, until)

    revalidatePath('/lessons/new-series')
    revalidatePath('/lessons')
    revalidatePath('/dashboard')
    return { error: null, affected, action: extending ? 'extended' : 'shortened' }
  } catch {
    return { error: t('lessons.seriesErrors.updateSeriesFailed') }
  }
}

export async function deleteSeriesAction(
  _prevState: SeriesManageState,
  formData: FormData
): Promise<SeriesManageState> {
  const t = await getTranslations()
  const session = await getSession()
  requireMutation(session)
  if (session.role !== 'owner' && session.role !== 'admin') {
    return { error: await commonError('noPermission') }
  }

  const seriesId = formData.get('series_id')
  if (typeof seriesId !== 'string' || !z.string().uuid().safeParse(seriesId).success) {
    return { error: await commonError('invalidData') }
  }

  try {
    const { affected } = await deleteLessonSeries(seriesId, session.orgId)
    revalidatePath('/lessons/new-series')
    revalidatePath('/lessons')
    revalidatePath('/dashboard')
    return { error: null, affected, action: 'deleted' }
  } catch {
    return { error: t('lessons.seriesErrors.updateSeriesFailed') }
  }
}
