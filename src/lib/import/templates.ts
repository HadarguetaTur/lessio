import * as XLSX from 'xlsx'
import type { EntityType } from './validators'
import { getT } from '@/lib/i18n/serverTranslator'
import type { AppLocale } from '@/lib/i18n/locale'

/**
 * The XLSX import templates users download.
 *
 * Only the column order and whether a column is required live here. The header
 * text, description and sample values come from
 * `import.templates.columns.<entity>.<field>` in the message catalogs, so the
 * template arrives in the language the user is working in.
 *
 * The Hebrew headers are still accepted on the way back in — `parseFile.ts` and
 * `validators.ts` match both — so a customer's existing Hebrew spreadsheet keeps
 * importing after this change.
 */

interface ColumnDef {
  /** Catalog key, and the field name used in the English template. */
  field: string
  required: boolean
}

const COLUMNS: Record<EntityType, ColumnDef[]> = {
  students: [
    { field: 'full_name', required: true },
    { field: 'grade', required: false },
    { field: 'phone', required: false },
    { field: 'level', required: false },
    { field: 'focused_subject', required: false },
    { field: 'weekly_quota', required: false },
    { field: 'notes', required: false },
    { field: 'status', required: false },
    { field: 'teacher_name', required: false },
  ],
  parents: [
    { field: 'full_name', required: true },
    { field: 'phone', required: true },
    { field: 'notes', required: false },
    { field: 'student_names', required: false },
    { field: 'whatsapp_consent', required: false },
  ],
  teachers: [
    { field: 'full_name', required: true },
    { field: 'email', required: true },
    { field: 'bio', required: false },
    { field: 'hourly_rate', required: false },
  ],
  'lessons-schedule': [
    { field: 'teacher_name', required: true },
    { field: 'student_name', required: true },
    { field: 'day_of_week', required: true },
    { field: 'start_time', required: true },
    { field: 'duration_minutes', required: true },
    { field: 'lesson_type', required: false },
  ],
  'family-list': [
    { field: 'student_name', required: true },
    { field: 'grade', required: false },
    { field: 'parent_name', required: true },
    { field: 'parent_phone', required: true },
    { field: 'parent_email', required: false },
    { field: 'parent_relation_type', required: false },
    { field: 'parent_name_2', required: false },
    { field: 'parent_phone_2', required: false },
    { field: 'parent_second_phone', required: false },
    { field: 'parent_address', required: false },
    { field: 'student_notes', required: false },
    { field: 'parent_notes', required: false },
    { field: 'parent_whatsapp_consent', required: false },
  ],
  'lessons-history': [
    { field: 'teacher_name', required: true },
    { field: 'student_name', required: true },
    { field: 'date', required: true },
    { field: 'start_time', required: true },
    { field: 'end_time', required: true },
    { field: 'status', required: false },
    { field: 'cancel_reason', required: false },
  ],
}

// Entity titles and required fields live in entityMeta.ts for client-safe access

/**
 * Generate a downloadable XLSX template for the given entity type.
 */
export async function generateTemplate(
  entityType: EntityType,
  locale: AppLocale = 'he'
): Promise<ArrayBuffer> {
  const t = await getT('import.templates', locale)
  const columns = COLUMNS[entityType]
  const col = (field: string, part: string) =>
    t(`columns.${entityType}.${field}.${part}`)

  const wb = XLSX.utils.book_new()

  // Data sheet
  const dataHeaders = columns.map((c) => col(c.field, 'header'))
  const row1 = columns.map((c) => col(c.field, 'ex1'))
  const row2 = columns.map((c) => col(c.field, 'ex2'))
  const dataSheet = XLSX.utils.aoa_to_sheet([dataHeaders, row1, row2])

  // Set column widths
  dataSheet['!cols'] = columns.map(() => ({ wch: 18 }))
  XLSX.utils.book_append_sheet(wb, dataSheet, t('dataSheet'))

  // Notes sheet
  const notesData = [
    [t('notesColumn'), t('notesEnglishName'), t('notesRequired'), t('notesDescription')],
    ...columns.map((c) => [
      col(c.field, 'header'),
      c.field,
      c.required ? t('yes') : t('no'),
      col(c.field, 'description'),
    ]),
  ]
  const notesSheet = XLSX.utils.aoa_to_sheet(notesData)
  notesSheet['!cols'] = [{ wch: 15 }, { wch: 18 }, { wch: 6 }, { wch: 45 }]
  XLSX.utils.book_append_sheet(wb, notesSheet, t('notesSheet'))

  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  return buf as ArrayBuffer
}

export function getTemplateFilename(entityType: EntityType): string {
  return `lessio-template-${entityType}.xlsx`
}
