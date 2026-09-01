'use server'

import { revalidatePath } from 'next/cache'
import { DateTime } from 'luxon'
import { isLessonDurationAllowed } from '@/lib/organizations/lessonDurations'
import { z } from 'zod'
import { getSession, requireMutation } from '@/lib/auth/session'
import { getOrgTimezone } from '@/lib/organizations'
import { requireQuotaCapacity } from '@/lib/saas/quota'
import { createLessonSeries } from '@/lib/lessons/createSeries'
import {
  extendLessonSeries,
  shortenLessonSeries,
} from '@/lib/lessons/updateSeries'
import { stopLessonSeries } from '@/lib/lessons/cancelSeries'
import { commonError, zodError } from '@/lib/i18n/actionErrors'
import { getTranslations } from 'next-intl/server'

const seriesBase = {
  teacher_id: z.string().uuid(),
  day_of_week: z.coerce.number().int().min(0).max(6),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  frequency: z.enum(['weekly', 'biweekly']),
  until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}

const SeriesFormSchema = z.discriminatedUnion('lesson_type', [
  z.object({
    ...seriesBase,
    lesson_type: z.literal('individual'),
    student_ids: z.array(z.string().uuid()).length(1, 'validation.atLeastOneStudent'),
    duration_minutes: z.coerce.number().int().positive(),
    price_per_student: z.null(),
  }),
  z.object({
    ...seriesBase,
    lesson_type: z.literal('pair'),
    student_ids: z
      .array(z.string().uuid())
      .length(2, 'validation.pairNeedsTwoStudents')
      .refine((ids) => new Set(ids).size === 2, 'validation.pairDistinctStudents'),
    duration_minutes: z.coerce.number().int().positive(),
    price_per_student: z.coerce.number().positive().optional().nullable(),
  }),
  z.object({
    ...seriesBase,
    lesson_type: z.literal('custom'),
    student_ids: z
      .array(z.string().uuid())
      .min(1, 'validation.atLeastOneStudent')
      .refine((ids) => new Set(ids).size === ids.length, 'validation.duplicateStudents'),
    duration_minutes: z.coerce.number().int().min(5).max(480),
    price_per_student: z.coerce.number().positive('validation.customPriceRequired'),
  }),
])

const SERIES_LESSON_TYPES = ['individual', 'pair', 'custom'] as const

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

  await requireQuotaCapacity(orgId, 'lessons_monthly')

  const rawType = String(formData.get('lesson_type') ?? '')
  const lessonType = (SERIES_LESSON_TYPES as readonly string[]).includes(rawType)
    ? (rawType as (typeof SERIES_LESSON_TYPES)[number])
    : 'individual'

  // Individual series still post a single `student_id`; the roster types post
  // repeated `student_ids`.
  const studentIds =
    lessonType === 'individual'
      ? [String(formData.get('student_id') ?? '')].filter(Boolean)
      : formData.getAll('student_ids').map(String).filter(Boolean)

  const rawPrice = formData.get('price_per_student')

  const parsed = SeriesFormSchema.safeParse({
    lesson_type: lessonType,
    teacher_id: formData.get('teacher_id'),
    student_ids: studentIds,
    day_of_week: formData.get('day_of_week'),
    start_time: formData.get('start_time'),
    duration_minutes: formData.get('duration_minutes'),
    frequency: formData.get('frequency'),
    until: formData.get('until'),
    price_per_student:
      lessonType === 'individual' || !rawPrice || !String(rawPrice).trim() ? null : rawPrice,
  })

  if (!parsed.success) {
    const firstError = parsed.error.issues[0]
    return { error: await zodError(firstError) }
  }

  const { teacher_id, student_ids, day_of_week, start_time, duration_minutes, frequency, until } =
    parsed.data
  const price_per_student = parsed.data.price_per_student ?? null
  if (lessonType !== 'custom' && !(await isLessonDurationAllowed(orgId, 'admin', duration_minutes))) {
    return { error: await commonError('invalidData') }
  }

  // "In the future" means the org's calendar day, not UTC's: createLessonSeries
  // walks dates in the org timezone, so comparing against a UTC date rejects a
  // valid `until` (or accepts a stale one) either side of midnight.
  const timezone = await getOrgTimezone(orgId)
  const todayStr = DateTime.now().setZone(timezone).toFormat('yyyy-MM-dd')
  if (until <= todayStr) {
    return { error: t('lessons.seriesErrors.endDateFuture') }
  }

  try {
    const result = await createLessonSeries({
      orgId,
      teacherId: teacher_id,
      studentIds: student_ids,
      rule: { frequency, day_of_week, start_time, duration_minutes, until },
      createdByProfileId: userId,
      lessonType,
      pricePerStudent: price_per_student,
    })

    revalidatePath('/lessons')

    return { error: null, result }
  } catch {
    return { error: t('lessons.seriesErrors.createSeriesFailed') }
  }
}

// ── Series management (existing-series list) ──────────────────────────────────

export type SeriesManageState = {
  error: string | null
  /** Lessons created (extend) or removed (shorten / stop). */
  affected?: number
  action?: 'extended' | 'shortened' | 'stopped'
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

const StopSeriesSchema = z.object({
  series_id: z.string().uuid(),
  stop_from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

export async function stopSeriesAction(
  _prevState: SeriesManageState,
  formData: FormData
): Promise<SeriesManageState> {
  const t = await getTranslations()
  const session = await getSession()
  requireMutation(session)
  if (session.role !== 'owner' && session.role !== 'admin') {
    return { error: await commonError('noPermission') }
  }

  const parsed = StopSeriesSchema.safeParse({
    series_id: formData.get('series_id'),
    stop_from_date: formData.get('stop_from_date'),
  })
  if (!parsed.success) return { error: t('lessons.series.stopDateRequired') }

  try {
    const { removed } = await stopLessonSeries(parsed.data.series_id, session.orgId, parsed.data.stop_from_date)
    revalidatePath('/lessons/new-series')
    revalidatePath('/lessons')
    revalidatePath('/dashboard')
    return { error: null, affected: removed, action: 'stopped' }
  } catch {
    return { error: t('lessons.seriesErrors.updateSeriesFailed') }
  }
}
