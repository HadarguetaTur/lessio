/**
 * CSV rows -> prospect inputs. Pure.
 *
 * Own alias map, not the student importer's: the tenant importer's
 * `normalizeHeaders` knows grades and parents, not companies. Unknown columns
 * are not dropped — they land in `metadata` so a campaign body can reach them
 * as `{{metadata.<column>}}`.
 */

import { z } from 'zod'
import type { RawRow } from '@/lib/import/parseFile'
import type { OutboundLocale } from './types'

export const PROSPECT_COLUMN_ALIASES: Record<string, string[]> = {
  email: ['email', 'e-mail', 'mail', 'email address', 'אימייל', 'מייל', 'דוא"ל', 'דואל'],
  first_name: ['first_name', 'first name', 'firstname', 'שם פרטי'],
  last_name: ['last_name', 'last name', 'lastname', 'surname', 'שם משפחה', 'משפחה'],
  name: ['name', 'full_name', 'full name', 'שם מלא', 'שם'],
  company: ['company', 'business', 'studio', 'organization', 'org', 'חברה', 'עסק', 'סטודיו', 'ארגון', 'בית ספר'],
  phone: ['phone', 'phone_number', 'tel', 'mobile', 'טלפון', 'נייד'],
  locale: ['locale', 'language', 'lang', 'שפה'],
  personal_line: ['personal_line', 'personal line', 'personalization', 'personalisation', 'icebreaker', 'שורה אישית', 'פתיח', 'משפט אישי'],
  subject_area: ['subject_area', 'subject area', 'subject', 'niche', 'field', 'תחום', 'מקצוע', 'נישה'],
  source_url: ['source_url', 'source url', 'url', 'website', 'link', 'קישור', 'אתר'],
}

const ALIAS_LOOKUP: Map<string, string> = new Map()
for (const [field, aliases] of Object.entries(PROSPECT_COLUMN_ALIASES)) {
  for (const alias of aliases) ALIAS_LOOKUP.set(alias.toLowerCase(), field)
}

export interface ProspectInput {
  email: string
  first_name: string | null
  last_name: string | null
  company: string | null
  phone: string | null
  locale: OutboundLocale
  personal_line: string | null
  subject_area: string | null
  source_url: string | null
  metadata: Record<string, string>
}

export interface NormalizeResult {
  valid: ProspectInput[]
  invalid: { row: number; reason: 'missing_email' | 'invalid_email' | 'duplicate_in_file' }[]
  /** Which CSV header became which field; unknown headers map to `metadata.<header>`. */
  mappedHeaders: Record<string, string>
}

const emailSchema = z.email()

function str(value: unknown): string | null {
  if (value == null) return null
  const s = String(value).trim()
  return s === '' ? null : s
}

function toLocale(value: string | null): OutboundLocale {
  if (!value) return 'he'
  const v = value.toLowerCase()
  if (v.startsWith('en') || v === 'english' || v === 'אנגלית') return 'en'
  return 'he'
}

export function normalizeProspectRows(headers: string[], rows: RawRow[]): NormalizeResult {
  const mappedHeaders: Record<string, string> = {}
  for (const header of headers) {
    const field = ALIAS_LOOKUP.get(header.trim().toLowerCase())
    mappedHeaders[header] = field ?? `metadata.${header.trim()}`
  }

  const valid: ProspectInput[] = []
  const invalid: NormalizeResult['invalid'] = []
  const seen = new Set<string>()

  rows.forEach((raw, index) => {
    const rowNumber = index + 2 // 1-based, after the header row
    const fields: Record<string, string | null> = {}
    const metadata: Record<string, string> = {}

    for (const header of headers) {
      const target = mappedHeaders[header]!
      const value = str(raw[header])
      if (target.startsWith('metadata.')) {
        if (value != null) metadata[target.slice('metadata.'.length)] = value
      } else if (fields[target] == null) {
        // First alias wins when a file carries both "name" and "first name".
        fields[target] = value
      }
    }

    const emailRaw = fields.email?.toLowerCase() ?? null
    if (!emailRaw) {
      invalid.push({ row: rowNumber, reason: 'missing_email' })
      return
    }
    if (!emailSchema.safeParse(emailRaw).success) {
      invalid.push({ row: rowNumber, reason: 'invalid_email' })
      return
    }
    if (seen.has(emailRaw)) {
      invalid.push({ row: rowNumber, reason: 'duplicate_in_file' })
      return
    }
    seen.add(emailRaw)

    let firstName = fields.first_name ?? null
    let lastName = fields.last_name ?? null
    if (!firstName && fields.name) {
      const parts = fields.name.split(/\s+/)
      firstName = parts[0] ?? null
      if (!lastName && parts.length > 1) lastName = parts.slice(1).join(' ')
    }

    valid.push({
      email: emailRaw,
      first_name: firstName,
      last_name: lastName,
      company: fields.company ?? null,
      phone: fields.phone ?? null,
      locale: toLocale(fields.locale ?? null),
      personal_line: fields.personal_line ?? null,
      subject_area: fields.subject_area ?? null,
      source_url: fields.source_url ?? null,
      metadata,
    })
  })

  return { valid, invalid, mappedHeaders }
}
