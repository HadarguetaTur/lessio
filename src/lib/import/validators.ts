import { z } from 'zod'

export type EntityType = 'students' | 'parents' | 'teachers' | 'lessons-schedule' | 'lessons-history'

export interface ValidatedRow {
  rowIndex: number
  status: 'valid' | 'warning' | 'error'
  data: Record<string, string | null>
  errors: string[]
  warnings: string[]
  existingId?: string | null
}

const studentRowSchema = z.object({
  full_name: z.string().min(1, 'שם מלא הוא שדה חובה'),
  grade: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  level: z.string().nullable().optional(),
  focused_subject: z.string().nullable().optional(),
  weekly_quota: z
    .string()
    .nullable()
    .optional()
    .refine(
      (v) => !v || (!isNaN(Number(v)) && Number(v) > 0 && Number(v) <= 20),
      'מכסה שבועית חייבת להיות מספר בין 1 ל-20'
    ),
  notes: z.string().nullable().optional(),
  status: z
    .string()
    .nullable()
    .optional()
    .refine(
      (v) => !v || ['active', 'on_hold', 'inactive', 'פעיל', 'מושהה', 'לא פעיל'].includes(v),
      'סטטוס לא תקין'
    ),
  teacher_name: z.string().nullable().optional(),
})

const parentRowSchema = z.object({
  full_name: z.string().min(1, 'שם מלא הוא שדה חובה'),
  phone: z.string().min(1, 'מספר טלפון הוא שדה חובה'),
  notes: z.string().nullable().optional(),
  student_names: z.string().nullable().optional(),
  student_name: z.string().nullable().optional(),
})

const teacherRowSchema = z.object({
  full_name: z.string().min(1, 'שם מלא הוא שדה חובה'),
  email: z.string().min(1, 'אימייל הוא שדה חובה').email('כתובת אימייל לא תקינה'),
  bio: z.string().nullable().optional(),
  hourly_rate: z
    .string()
    .nullable()
    .optional()
    .refine(
      (v) => !v || (!isNaN(Number(v)) && Number(v) >= 0),
      'תעריף שעתי חייב להיות מספר חיובי'
    ),
})

const lessonScheduleRowSchema = z.object({
  teacher_name: z.string().min(1, 'שם מורה הוא שדה חובה'),
  student_name: z.string().min(1, 'שם תלמיד הוא שדה חובה'),
  day_of_week: z.string().min(1, 'יום בשבוע הוא שדה חובה'),
  start_time: z
    .string()
    .min(1, 'שעת התחלה היא שדה חובה')
    .refine((v) => /^\d{1,2}:\d{2}$/.test(v), 'פורמט שעה לא תקין (HH:MM)'),
  duration_minutes: z
    .string()
    .min(1, 'משך השיעור הוא שדה חובה')
    .refine(
      (v) => !isNaN(Number(v)) && Number(v) > 0 && Number(v) <= 480,
      'משך חייב להיות מספר בין 1 ל-480'
    ),
  lesson_type: z
    .string()
    .nullable()
    .optional()
    .refine(
      (v) => !v || ['individual', 'pair', 'group', 'פרטי', 'זוגי', 'קבוצתי'].includes(v),
      'סוג שיעור לא תקין'
    ),
})

const lessonHistoryRowSchema = z.object({
  teacher_name: z.string().min(1, 'שם מורה הוא שדה חובה'),
  student_name: z.string().min(1, 'שם תלמיד הוא שדה חובה'),
  date: z.string().min(1, 'תאריך הוא שדה חובה'),
  start_time: z
    .string()
    .min(1, 'שעת התחלה היא שדה חובה')
    .refine((v) => /^\d{1,2}:\d{2}$/.test(v), 'פורמט שעה לא תקין (HH:MM)'),
  end_time: z
    .string()
    .min(1, 'שעת סיום היא שדה חובה')
    .refine((v) => /^\d{1,2}:\d{2}$/.test(v), 'פורמט שעה לא תקין (HH:MM)'),
  status: z
    .string()
    .nullable()
    .optional()
    .refine(
      (v) =>
        !v ||
        ['scheduled', 'completed', 'cancelled', 'no_show', 'מתוכנן', 'הושלם', 'בוטל', 'לא הגיע'].includes(v),
      'סטטוס לא תקין'
    ),
  cancel_reason: z.string().nullable().optional(),
})

function getSchema(entityType: EntityType) {
  switch (entityType) {
    case 'students':
      return studentRowSchema
    case 'parents':
      return parentRowSchema
    case 'teachers':
      return teacherRowSchema
    case 'lessons-schedule':
      return lessonScheduleRowSchema
    case 'lessons-history':
      return lessonHistoryRowSchema
  }
}

/**
 * Validate rows against the schema for the given entity type.
 * Phase 1: field-level validation only. Phase 2 (relational) happens in executeImport.
 */
export function validateRows(
  rows: Record<string, string | null>[],
  entityType: EntityType
): ValidatedRow[] {
  const schema = getSchema(entityType)

  return rows.map((row, index) => {
    const result = schema.safeParse(row)
    const errors: string[] = []
    const warnings: string[] = []

    if (!result.success) {
      for (const issue of result.error.issues) {
        errors.push(`${issue.path.join('.')}: ${issue.message}`)
      }
    }

    // Warn on empty optional fields that are commonly expected
    if (entityType === 'students' && !row.full_name) {
      errors.push('שם מלא הוא שדה חובה')
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
  'פעיל': 'active',
  'מושהה': 'on_hold',
  'לא פעיל': 'inactive',
  'מתוכנן': 'scheduled',
  'הושלם': 'completed',
  'בוטל': 'cancelled',
  'לא הגיע': 'no_show',
}

const LESSON_TYPE_HE_TO_EN: Record<string, string> = {
  'פרטי': 'individual',
  'זוגי': 'pair',
  'קבוצתי': 'group',
}

const DAY_HE_TO_NUM: Record<string, number> = {
  'ראשון': 0,
  'שני': 1,
  'שלישי': 2,
  'רביעי': 3,
  'חמישי': 4,
  'שישי': 5,
  'שבת': 6,
  'sunday': 0,
  'monday': 1,
  'tuesday': 2,
  'wednesday': 3,
  'thursday': 4,
  'friday': 5,
  'saturday': 6,
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
