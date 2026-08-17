import { describe, expect, it } from 'vitest'

import { APPROVED_TEMPLATES } from './approvedTemplates'
import { TEMPLATES } from './registerTemplates'
import { DEFAULT_TEMPLATES } from './templates'

const LOCALES = ['he', 'en'] as const

describe('approved templates registry consistency', () => {
  it('registers every approved template with Meta on WABA connection', () => {
    const registeredNames = new Set(TEMPLATES.map((t) => t.name))

    for (const locale of LOCALES) {
      for (const [type, approved] of Object.entries(APPROVED_TEMPLATES[locale])) {
        expect(
          registeredNames.has(approved.name),
          `${locale}/${type} → ${approved.name} missing from registerTemplates`
        ).toBe(true)
      }
    }
  })

  it('registers each approved template under its own language code', () => {
    const byName = new Map(TEMPLATES.map((t) => [t.name, t.language]))

    for (const locale of LOCALES) {
      for (const [type, approved] of Object.entries(APPROVED_TEMPLATES[locale])) {
        expect(approved.languageCode, `${locale}/${type} languageCode`).toBe(locale)
        expect(byName.get(approved.name), `${approved.name} registered language`).toBe(locale)
      }
    }
  })

  it('covers the same template types in both languages', () => {
    expect(Object.keys(APPROVED_TEMPLATES.en).sort()).toEqual(
      Object.keys(APPROVED_TEMPLATES.he).sort()
    )
  })

  it('maps every approved template type to a known MessageTemplateType', () => {
    for (const locale of LOCALES) {
      for (const type of Object.keys(APPROVED_TEMPLATES[locale])) {
        expect(DEFAULT_TEMPLATES.he).toHaveProperty(type)
      }
    }
  })

  it('covers all 19 message template types with defaults in every language', () => {
    for (const locale of LOCALES) {
      expect(Object.keys(DEFAULT_TEMPLATES[locale])).toHaveLength(19)
    }
    expect(Object.keys(DEFAULT_TEMPLATES.en).sort()).toEqual(
      Object.keys(DEFAULT_TEMPLATES.he).sort()
    )
  })

  it('keeps the same {{variables}} in both languages of every default template', () => {
    const varsOf = (body: string) => (body.match(/\{\{(\w+)\}\}/g) ?? []).sort()

    for (const type of Object.keys(DEFAULT_TEMPLATES.he) as Array<
      keyof typeof DEFAULT_TEMPLATES.he
    >) {
      expect(varsOf(DEFAULT_TEMPLATES.en[type]), `${type} variables`).toEqual(
        varsOf(DEFAULT_TEMPLATES.he[type])
      )
    }
  })
})
