import { describe, expect, it } from 'vitest'
import { parseFile } from '@/lib/import/parseFile'
import { normalizeProspectRows } from './normalizeProspects'

function csv(text: string) {
  const buf = new TextEncoder().encode(text).buffer as ArrayBuffer
  const { headers, rows } = parseFile(buf, 'prospects.csv')
  return normalizeProspectRows(headers, rows)
}

describe('normalizeProspectRows', () => {
  it('maps Hebrew headers and lowercases the email', () => {
    const r = csv('אימייל,שם פרטי,חברה,שורה אישית,תחום\nDana@Example.com,דנה,סטודיו דנה,ראיתי את האתר,מתמטיקה\n')
    expect(r.invalid).toEqual([])
    expect(r.valid[0]).toMatchObject({
      email: 'dana@example.com',
      first_name: 'דנה',
      company: 'סטודיו דנה',
      personal_line: 'ראיתי את האתר',
      subject_area: 'מתמטיקה',
      locale: 'he',
    })
  })

  it('survives a BOM and CRLF', () => {
    const r = csv('﻿email,first_name\r\na@b.com,A\r\n')
    expect(r.valid).toHaveLength(1)
    expect(r.valid[0]!.email).toBe('a@b.com')
  })

  it('splits a full name when no first name is given', () => {
    const r = csv('email,name\na@b.com,Dana Cohen Levi\n')
    expect(r.valid[0]).toMatchObject({ first_name: 'Dana', last_name: 'Cohen Levi' })
  })

  it('rejects missing and invalid emails with the row number', () => {
    const r = csv('email,first_name\n,A\nnot-an-email,B\nok@b.com,C\n')
    expect(r.invalid).toEqual([
      { row: 2, reason: 'missing_email' },
      { row: 3, reason: 'invalid_email' },
    ])
    expect(r.valid).toHaveLength(1)
  })

  it('dedupes within the file, case-insensitively', () => {
    const r = csv('email\nA@b.com\na@B.com\n')
    expect(r.valid).toHaveLength(1)
    expect(r.invalid).toEqual([{ row: 3, reason: 'duplicate_in_file' }])
  })

  it('keeps unknown columns as metadata', () => {
    const r = csv('email,city,students\na@b.com,חיפה,40\n')
    expect(r.valid[0]!.metadata).toEqual({ city: 'חיפה', students: '40' })
    expect(r.mappedHeaders.city).toBe('metadata.city')
  })

  it('reads an English locale column', () => {
    const r = csv('email,locale\na@b.com,en\nb@b.com,he\nc@b.com,\n')
    expect(r.valid.map((v) => v.locale)).toEqual(['en', 'he', 'he'])
  })
})
