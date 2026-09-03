export interface RawRow {
  [key: string]: string | number | boolean | null | undefined
}

/**
 * Parse an uploaded CSV into an array of row objects.
 * Returns the header row and data rows separately.
 */
export function parseFile(buffer: ArrayBuffer, filename: string): {
  headers: string[]
  rows: RawRow[]
} {
  if (!filename.toLowerCase().endsWith('.csv')) {
    throw new Error('Only CSV imports are supported')
  }
  const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^\uFEFF/, '')
  const records: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (char === '"') quoted = false
      else field += char
    } else if (char === '"') quoted = true
    else if (char === ',') { row.push(field); field = '' }
    else if (char === '\n') { row.push(field.replace(/\r$/, '')); records.push(row); row = []; field = '' }
    else field += char
  }
  if (quoted) throw new Error('Unterminated CSV quote')
  if (field || row.length) { row.push(field.replace(/\r$/, '')); records.push(row) }
  const headers = records.shift()?.map((value) => value.trim()) ?? []
  if (headers.length === 0) {
    return { headers: [], rows: [] }
  }
  const rows = records
    .filter((record) => record.some((value) => value.trim() !== ''))
    .map((record) => Object.fromEntries(headers.map((header, index) => [header, record[index] ?? null])))
  return { headers, rows }
}

const COLUMN_ALIASES: Record<string, string[]> = {
  full_name: ['שם מלא', 'full_name', 'name', 'שם'],
  grade: ['כיתה', 'grade', 'class'],
  phone: ['טלפון', 'phone', 'phone_number', 'tel', 'נייד', 'מספר טלפון'],
  level: ['רמה', 'level'],
  focused_subject: ['מקצוע', 'focused_subject', 'subject'],
  weekly_quota: ['מכסה שבועית', 'weekly_quota', 'quota'],
  notes: ['הערות', 'notes', 'הערה'],
  status: ['סטטוס', 'status'],
  teacher_name: ['שם מורה', 'teacher_name', 'teacher', 'מורה'],
  student_names: ['שמות תלמידים', 'student_names', 'students', 'תלמידים'],
  student_name: ['שם תלמיד', 'שם התלמיד', 'student_name', 'student', 'תלמיד'],
  day_of_week: ['יום בשבוע', 'day_of_week', 'day', 'יום'],
  start_time: ['שעת התחלה', 'start_time', 'start', 'התחלה'],
  end_time: ['שעת סיום', 'end_time', 'end', 'סיום'],
  duration_minutes: ['משך (דקות)', 'duration_minutes', 'duration', 'משך', 'דקות'],
  lesson_type: ['סוג שיעור', 'lesson_type', 'type', 'סוג'],
  date: ['תאריך', 'date'],
  cancel_reason: ['סיבת ביטול', 'cancel_reason', 'reason', 'סיבה'],
  email: ['אימייל', 'email', 'דוא"ל', 'מייל'],
  bio: ['ביוגרפיה', 'bio', 'אודות', 'תיאור'],
  hourly_rate: ['תעריף שעתי', 'hourly_rate', 'rate', 'תעריף', 'מחיר לשעה'],
  parent_name: ['שם הורה', 'parent_name', 'parent', 'הורה'],
  parent_phone: ['טלפון הורה', 'parent_phone', 'phone_parent'],
  parent_name_2: ['שם הורה 2', 'parent_name_2', 'שם הורה שני'],
  parent_phone_2: ['טלפון הורה 2', 'parent_phone_2', 'טלפון הורה שני'],
  student_notes: ['הערות תלמיד', 'student_notes'],
  parent_notes: ['הערות הורה', 'parent_notes'],
  parent_email: ['אימייל הורה', 'parent_email', 'מייל הורה', 'email_parent'],
  parent_relation_type: ['סוג קשר', 'parent_relation_type', 'יחס הורה', 'relation_type', 'קשר'],
  parent_second_phone: ['טלפון נוסף הורה', 'parent_second_phone', 'second_phone_parent'],
  parent_address: ['כתובת הורה', 'parent_address', 'address_parent', 'כתובת'],
  // Optional consent column. Any truthy value in the row records
  // consent_source = 'import'; see normalizedImportedConsent in executeImport.ts.
  whatsapp_consent: ['הסכמה לוואטסאפ', 'אישור הודעות', 'whatsapp_consent', 'consent', 'הסכמה'],
  parent_whatsapp_consent: ['הסכמה לוואטסאפ הורה', 'parent_whatsapp_consent', 'אישור הודעות הורה'],
}

/**
 * Normalize column headers by mapping Hebrew/alternative names to canonical keys.
 */
export function normalizeHeaders(
  rows: RawRow[],
  headers: string[]
): { normalizedRows: Record<string, string | null>[]; mappedHeaders: Record<string, string> } {
  const headerMap: Record<string, string> = {}

  for (const header of headers) {
    const trimmed = header.trim().toLowerCase()
    for (const [canonical, aliases] of Object.entries(COLUMN_ALIASES)) {
      if (aliases.some((a) => a.toLowerCase() === trimmed)) {
        headerMap[header] = canonical
        break
      }
    }
    if (!headerMap[header]) {
      headerMap[header] = header
    }
  }

  const normalizedRows = rows.map((row) => {
    const normalized: Record<string, string | null> = {}
    for (const [originalHeader, value] of Object.entries(row)) {
      const key = headerMap[originalHeader] ?? originalHeader
      normalized[key] = value != null ? String(value).trim() : null
    }
    return normalized
  })

  return { normalizedRows, mappedHeaders: headerMap }
}
