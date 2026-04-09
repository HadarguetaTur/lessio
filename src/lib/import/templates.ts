import * as XLSX from 'xlsx'
import type { EntityType } from './validators'

interface ColumnDef {
  headerHe: string
  headerEn: string
  required: boolean
  description: string
  exampleValues: string[]
}

const STUDENT_COLUMNS: ColumnDef[] = [
  { headerHe: 'שם מלא', headerEn: 'full_name', required: true, description: 'שם מלא של התלמיד', exampleValues: ['יוסי כהן', 'שרה לוי'] },
  { headerHe: 'כיתה', headerEn: 'grade', required: false, description: 'כיתה (לדוגמה: ז, ח, י)', exampleValues: ['ח', 'י'] },
  { headerHe: 'טלפון', headerEn: 'phone', required: false, description: 'מספר טלפון (E.164 או מקומי)', exampleValues: ['0501234567', ''] },
  { headerHe: 'רמה', headerEn: 'level', required: false, description: 'רמת התלמיד', exampleValues: ['מתחיל', 'מתקדם'] },
  { headerHe: 'מקצוע', headerEn: 'focused_subject', required: false, description: 'מקצוע מרכזי', exampleValues: ['מתמטיקה', 'אנגלית'] },
  { headerHe: 'מכסה שבועית', headerEn: 'weekly_quota', required: false, description: 'מספר שיעורים בשבוע (1-20)', exampleValues: ['2', '3'] },
  { headerHe: 'הערות', headerEn: 'notes', required: false, description: 'הערות חופשיות', exampleValues: ['חדש', ''] },
  { headerHe: 'סטטוס', headerEn: 'status', required: false, description: 'active / on_hold / inactive (ברירת מחדל: active)', exampleValues: ['active', 'active'] },
  { headerHe: 'שם מורה', headerEn: 'teacher_name', required: false, description: 'שם המורה המשויך (ימופה אוטומטית)', exampleValues: ['דנה כהן', ''] },
]

const PARENT_COLUMNS: ColumnDef[] = [
  { headerHe: 'שם מלא', headerEn: 'full_name', required: true, description: 'שם מלא של ההורה', exampleValues: ['אבי כהן', 'רחל לוי'] },
  { headerHe: 'טלפון', headerEn: 'phone', required: true, description: 'מספר טלפון (חובה)', exampleValues: ['0501234567', '0521234567'] },
  { headerHe: 'הערות', headerEn: 'notes', required: false, description: 'הערות חופשיות', exampleValues: ['', 'אם חד הורית'] },
  { headerHe: 'שמות תלמידים', headerEn: 'student_names', required: false, description: 'שמות תלמידים מופרדים בפסיק', exampleValues: ['יוסי כהן', 'שרה לוי'] },
]

const TEACHER_COLUMNS: ColumnDef[] = [
  { headerHe: 'שם מלא', headerEn: 'full_name', required: true, description: 'שם מלא של המורה', exampleValues: ['דנה כהן', 'יוסי לוי'] },
  { headerHe: 'אימייל', headerEn: 'email', required: true, description: 'כתובת אימייל (ישמש להתחברות)', exampleValues: ['dana@example.com', 'yossi@example.com'] },
  { headerHe: 'ביוגרפיה', headerEn: 'bio', required: false, description: 'תיאור קצר על המורה', exampleValues: ['מורה למתמטיקה בניסיון של 10 שנים', ''] },
  { headerHe: 'תעריף שעתי', headerEn: 'hourly_rate', required: false, description: 'תעריף לשעה (מספר)', exampleValues: ['150', '200'] },
]

const LESSON_SCHEDULE_COLUMNS: ColumnDef[] = [
  { headerHe: 'שם מורה', headerEn: 'teacher_name', required: true, description: 'שם המורה', exampleValues: ['דנה כהן', 'דנה כהן'] },
  { headerHe: 'שם תלמיד', headerEn: 'student_name', required: true, description: 'שם התלמיד', exampleValues: ['יוסי כהן', 'שרה לוי'] },
  { headerHe: 'יום בשבוע', headerEn: 'day_of_week', required: true, description: 'יום בשבוע (0-6 או שם היום)', exampleValues: ['ראשון', 'שלישי'] },
  { headerHe: 'שעת התחלה', headerEn: 'start_time', required: true, description: 'שעת התחלה בפורמט HH:MM', exampleValues: ['14:00', '16:30'] },
  { headerHe: 'משך (דקות)', headerEn: 'duration_minutes', required: true, description: 'משך השיעור בדקות', exampleValues: ['45', '60'] },
  { headerHe: 'סוג שיעור', headerEn: 'lesson_type', required: false, description: 'individual / pair / group (ברירת מחדל: individual)', exampleValues: ['individual', 'individual'] },
]

const LESSON_HISTORY_COLUMNS: ColumnDef[] = [
  { headerHe: 'שם מורה', headerEn: 'teacher_name', required: true, description: 'שם המורה', exampleValues: ['דנה כהן', 'דנה כהן'] },
  { headerHe: 'שם תלמיד', headerEn: 'student_name', required: true, description: 'שם התלמיד', exampleValues: ['יוסי כהן', 'שרה לוי'] },
  { headerHe: 'תאריך', headerEn: 'date', required: true, description: 'תאריך בפורמט DD/MM/YYYY', exampleValues: ['01/04/2026', '03/04/2026'] },
  { headerHe: 'שעת התחלה', headerEn: 'start_time', required: true, description: 'שעת התחלה HH:MM', exampleValues: ['14:00', '16:30'] },
  { headerHe: 'שעת סיום', headerEn: 'end_time', required: true, description: 'שעת סיום HH:MM', exampleValues: ['14:45', '17:30'] },
  { headerHe: 'סטטוס', headerEn: 'status', required: false, description: 'scheduled / completed / cancelled / no_show (ברירת מחדל: completed)', exampleValues: ['completed', 'completed'] },
  { headerHe: 'סיבת ביטול', headerEn: 'cancel_reason', required: false, description: 'סיבת ביטול (אם רלוונטי)', exampleValues: ['', ''] },
]

function getColumns(entityType: EntityType): ColumnDef[] {
  switch (entityType) {
    case 'students': return STUDENT_COLUMNS
    case 'parents': return PARENT_COLUMNS
    case 'teachers': return TEACHER_COLUMNS
    case 'lessons-schedule': return LESSON_SCHEDULE_COLUMNS
    case 'lessons-history': return LESSON_HISTORY_COLUMNS
  }
}

// Entity titles and required fields live in entityMeta.ts for client-safe access

/**
 * Generate a downloadable XLSX template for the given entity type.
 * Includes a data sheet with headers + example rows and a notes sheet.
 */
export function generateTemplate(entityType: EntityType): ArrayBuffer {
  const columns = getColumns(entityType)
  const wb = XLSX.utils.book_new()

  // Data sheet
  const dataHeaders = columns.map((c) => c.headerHe)
  const row1 = columns.map((c) => c.exampleValues[0] ?? '')
  const row2 = columns.map((c) => c.exampleValues[1] ?? '')
  const dataSheet = XLSX.utils.aoa_to_sheet([dataHeaders, row1, row2])

  // Set column widths
  dataSheet['!cols'] = columns.map(() => ({ wch: 18 }))
  XLSX.utils.book_append_sheet(wb, dataSheet, 'נתונים')

  // Notes sheet
  const notesData = [
    ['עמודה', 'שם באנגלית', 'חובה?', 'תיאור'],
    ...columns.map((c) => [
      c.headerHe,
      c.headerEn,
      c.required ? 'כן' : 'לא',
      c.description,
    ]),
  ]
  const notesSheet = XLSX.utils.aoa_to_sheet(notesData)
  notesSheet['!cols'] = [{ wch: 15 }, { wch: 18 }, { wch: 6 }, { wch: 45 }]
  XLSX.utils.book_append_sheet(wb, notesSheet, 'הערות')

  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  return buf as ArrayBuffer
}

export function getTemplateFilename(entityType: EntityType): string {
  return `lessio-template-${entityType}.xlsx`
}

