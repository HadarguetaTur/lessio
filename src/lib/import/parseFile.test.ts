import { describe, expect, it } from 'vitest'
import { parseFile, ImportParseError } from './parseFile'

const utf8 = (text: string): ArrayBuffer => new TextEncoder().encode(text).buffer as ArrayBuffer

/** What Excel writes for Hebrew when you do not pick "CSV UTF-8" by hand. */
function windows1255(text: string): ArrayBuffer {
  const map: Record<string, number> = {}
  // 0xE0..0xFA is alef..tav in Windows-1255.
  'אבגדהוזחטיךכלםמןנסעףפץצקרשת'.split('').forEach((letter, i) => {
    map[letter] = 0xe0 + i
  })
  const bytes = [...text].map((ch) => map[ch] ?? ch.charCodeAt(0))
  return new Uint8Array(bytes).buffer
}

describe('parseFile', () => {
  it('reads a plain comma-separated file', () => {
    const { headers, rows } = parseFile(utf8('email,name\na@b.com,Dana\n'), 'x.csv')
    expect(headers).toEqual(['email', 'name'])
    expect(rows).toEqual([{ email: 'a@b.com', name: 'Dana' }])
  })

  it('reads the semicolons Excel writes on an Israeli or European locale', () => {
    const { headers, rows } = parseFile(utf8('אימייל;שם;עסק\na@b.com;דנה;סטודיו\n'), 'x.csv')
    expect(headers).toEqual(['אימייל', 'שם', 'עסק'])
    expect(rows[0]).toEqual({ אימייל: 'a@b.com', שם: 'דנה', עסק: 'סטודיו' })
  })

  it('reads a tab-separated export', () => {
    const { headers } = parseFile(utf8('email\tname\na@b.com\tDana\n'), 'x.csv')
    expect(headers).toEqual(['email', 'name'])
  })

  it('does not mistake commas inside quoted values for the delimiter', () => {
    const { headers, rows } = parseFile(utf8('email;note\na@b.com;"one, two, three"\n'), 'x.csv')
    expect(headers).toEqual(['email', 'note'])
    expect(rows[0]!.note).toBe('one, two, three')
  })

  it('still prefers the comma when a value happens to hold semicolons', () => {
    const { headers } = parseFile(utf8('email,note,city\na@b.com,"a;b;c;d",Haifa\n'), 'x.csv')
    expect(headers).toEqual(['email', 'note', 'city'])
  })

  it('falls back to Windows-1255 instead of rejecting a Hebrew Excel export', () => {
    const { headers, rows } = parseFile(windows1255('אימייל,שם\na@b.com,דנה\n'), 'x.csv')
    expect(headers).toEqual(['אימייל', 'שם'])
    expect(rows[0]!.שם).toBe('דנה')
  })

  it('strips the BOM that "CSV UTF-8" adds', () => {
    const { headers } = parseFile(utf8('﻿email,name\na@b.com,Dana\n'), 'x.csv')
    expect(headers[0]).toBe('email')
  })

  it('refuses anything that is not a .csv', () => {
    expect(() => parseFile(utf8('x'), 'leads.xlsx')).toThrow(/Only CSV/)
  })
})

describe('parseFile — named failures', () => {
  it('refuses a non-CSV with a code the API can turn into advice', () => {
    try {
      parseFile(utf8('x'), 'leads.xlsx')
      throw new Error('expected parseFile to throw')
    } catch (e) {
      expect(e).toBeInstanceOf(ImportParseError)
      expect((e as ImportParseError).code).toBe('unsupportedFormat')
    }
  })

  it('names an unterminated quote rather than failing as a generic 500', () => {
    try {
      parseFile(utf8('email,note\na@b.com,"never closed\n'), 'x.csv')
      throw new Error('expected parseFile to throw')
    } catch (e) {
      expect(e).toBeInstanceOf(ImportParseError)
      expect((e as ImportParseError).code).toBe('unterminatedQuote')
    }
  })
})
