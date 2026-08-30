import { z } from 'zod'

export type EntityType = 'students' | 'parents' | 'teachers' | 'lessons-schedule' | 'lessons-history' | 'family-list'

export interface ValidatedRow {
  rowIndex: number
  status: 'valid' | 'warning' | 'error'
  data: Record<string, string | null>
  errors: string[]
  warnings: string[]
  existingId?: string | null
  /** family-list only: existing student matched by name */
  existingStudentId?: string | null
  /** family-list only: existing parent matched by phone */
  existingParentId?: string | null
  /** Blocking references that must exist before this row can be imported. */
  missingDependencies?: Array<{
    type: 'teacher' | 'student'
    name: string
  }>
}

/** Translator for keys under `import` namespace, e.g. `validation.fullNameRequired`. */
export type ImportMessageFn = (key: string) => string

function studentRowSchema(m: ImportMessageFn) {
  return z.object({
    full_name: z.string().min(1, m('validation.fullNameRequired')),
    grade: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    level: z.string().nullable().optional(),
    focused_subject: z.string().nullable().optional(),
    weekly_quota: z
      .string()
      .nullable()
      .optional()
      .refine(
        (v) => !v || (!isNaN(Number(v)) && Number(v) > 0 && Number(v) <= 10),
        m('validation.weeklyQuotaInvalid')
      ),
    notes: z.string().nullable().optional(),
    status: z
      .string()
      .nullable()
      .optional()
      .refine(
        (v) => !v || ['active', 'on_hold', 'inactive', 'פעיל', 'מושהה', 'לא פעיל'].includes(v),
        m('validation.studentStatusInvalid')
      ),
    teacher_name: z.string().nullable().optional(),
  })
}

function parentRowSchema(m: ImportMessageFn) {
  return z.object({
    full_name: z.string().min(1, m('validation.fullNameRequired')),
    phone: z.string().min(1, m('validation.phoneRequired')),
    notes: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    second_phone: z.string().nullable().optional(),
    address: z.string().nullable().optional(),
    relation_type: z.string().nullable().optional(),
    student_names: z.string().nullable().optional(),
    student_name: z.string().nullable().optional(),
  })
}

function teacherRowSchema(m: ImportMessageFn) {
  return z.object({
    full_name: z.string().min(1, m('validation.fullNameRequired')),
    email: z.string().min(1, m('validation.emailRequired')).email(m('validation.invalidEmail')),
    bio: z.string().nullable().optional(),
    hourly_rate: z
      .string()
      .nullable()
      .optional()
      .refine(
        (v) => !v || (!isNaN(Number(v)) && Number(v) >= 0),
        m('validation.hourlyRateInvalid')
      ),
  })
}

function lessonScheduleRowSchema(m: ImportMessageFn) {
  return z.object({
    teacher_name: z.string().min(1, m('validation.teacherNameRequired')),
    student_name: z.string().min(1, m('validation.studentNameRequired')),
    day_of_week: z.string().min(1, m('validation.dayOfWeekRequired')),
    start_time: z
      .string()
      .min(1, m('validation.startTimeRequired'))
      .refine((v) => /^\d{1,2}:\d{2}$/.test(v), m('validation.timeFormatInvalid')),
    duration_minutes: z
      .string()
      .min(1, m('validation.durationRequired'))
      .refine(
        (v) => !isNaN(Number(v)) && Number(v) > 0 && Number(v) <= 480,
        m('validation.durationInvalid')
      ),
    lesson_type: z
      .string()
      .nullable()
      .optional()
      .refine(
        (v) => !v || ['individual', 'pair', 'group', 'פרטי', 'זוגי', 'קבוצתי'].includes(v),
        m('validation.lessonTypeInvalid')
      ),
  })
}

function familyListRowSchema(m: ImportMessageFn) {
  return z
    .object({
      student_name: z.string().min(1, m('validation.studentNameRequired')),
      grade: z.string().nullable().optional(),
      parent_name: z.string().min(1, m('validation.parentNameRequired')),
      parent_phone: z.string().min(1, m('validation.phoneRequired')),
      parent_name_2: z.string().nullable().optional(),
      parent_phone_2: z.string().nullable().optional(),
      student_notes: z.string().nullable().optional(),
      parent_notes: z.string().nullable().optional(),
      parent_email: z.string().nullable().optional(),
      parent_second_phone: z.string().nullable().optional(),
      parent_address: z.string().nullable().optional(),
      parent_relation_type: z.string().nullable().optional(),
    })
    .superRefine((data, ctx) => {
      if (data.parent_phone_2 && !data.parent_name_2) {
        ctx.addIssue({ code: 'custom', path: ['parent_name_2'], message: m('validation.parent2NameRequired') })
      }
      if (data.parent_email?.trim()) {
        const ok = z.string().email().safeParse(data.parent_email.trim())
        if (!ok.success) {
          ctx.addIssue({ code: 'custom', path: ['parent_email'], message: m('validation.invalidEmail') })
        }
      }
    })
}

function lessonHistoryRowSchema(m: ImportMessageFn) {
  return z.object({
    teacher_name: z.string().min(1, m('validation.teacherNameRequired')),
    student_name: z.string().min(1, m('validation.studentNameRequired')),
    date: z.string().min(1, m('validation.dateRequired')),
    start_time: z
      .string()
      .min(1, m('validation.startTimeRequired'))
      .refine((v) => /^\d{1,2}:\d{2}$/.test(v), m('validation.timeFormatInvalid')),
    end_time: z
      .string()
      .min(1, m('validation.endTimeRequired'))
      .refine((v) => /^\d{1,2}:\d{2}$/.test(v), m('validation.timeFormatInvalid')),
    status: z
      .string()
      .nullable()
      .optional()
      .refine(
        (v) =>
          !v ||
          ['scheduled', 'completed', 'cancelled', 'no_show', 'מתוכנן', 'הושלם', 'בוטל', 'לא הגיע'].includes(v),
        m('validation.lessonStatusInvalid')
      ),
    cancel_reason: z.string().nullable().optional(),
  })
}

function getSchema(entityType: EntityType, m: ImportMessageFn) {
  switch (entityType) {
    case 'students':
      return studentRowSchema(m)
    case 'parents':
      return parentRowSchema(m)
    case 'teachers':
      return teacherRowSchema(m)
    case 'lessons-schedule':
      return lessonScheduleRowSchema(m)
    case 'lessons-history':
      return lessonHistoryRowSchema(m)
    case 'family-list':
      return familyListRowSchema(m)
  }
}

/**
 * Validate rows against the schema for the given entity type.
 */
export function validateRows(
  rows: Record<string, string | null>[],
  entityType: EntityType,
  m: ImportMessageFn
): ValidatedRow[] {
  const schema = getSchema(entityType, m)

  return rows.map((row, index) => {
    const result = schema.safeParse(row)
    const errors: string[] = []
    const warnings: string[] = []

    if (!result.success) {
      for (const issue of result.error.issues) {
        errors.push(issue.message)
      }
    }

    return {
      rowIndex: index,
      status: errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'valid',
      data: row,
      errors,
      warnings,
    }
  })
}

const STATUS_HE_TO_EN: Record<string, string> = {
  פעיל: 'active',
  מושהה: 'on_hold',
  'לא פעיל': 'inactive',
  מתוכנן: 'scheduled',
  הושלם: 'completed',
  בוטל: 'cancelled',
  'לא הגיע': 'no_show',
}

const LESSON_TYPE_HE_TO_EN: Record<string, string> = {
  פרטי: 'individual',
  זוגי: 'pair',
  קבוצתי: 'group',
}

const DAY_HE_TO_NUM: Record<string, number> = {
  ראשון: 0,
  שני: 1,
  שלישי: 2,
  רביעי: 3,
  חמישי: 4,
  שישי: 5,
  שבת: 6,
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
}

export function normalizeStatus(value: string | null | undefined): string | null {
  if (!value) return null
  return STATUS_HE_TO_EN[value] ?? value
}

export function normalizeLessonType(value: string | null | undefined): string {
  if (!value) return 'individual'
  return LESSON_TYPE_HE_TO_EN[value] ?? value
}

export function normalizeDayOfWeek(value: string | null | undefined): number | null {
  if (value == null) return null
  const trimmed = value.trim().toLowerCase()
  if (!isNaN(Number(trimmed))) {
    const num = Number(trimmed)
    return num >= 0 && num <= 6 ? num : null
  }
  return DAY_HE_TO_NUM[trimmed] ?? null
}
