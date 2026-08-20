import { describe, expect, it } from 'vitest'

import { APPROVED_TEMPLATES, PARAM_LIMITS, param } from './approvedTemplates'
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

  it('covers all 20 message template types with defaults in every language', () => {
    for (const locale of LOCALES) {
      expect(Object.keys(DEFAULT_TEMPLATES[locale])).toHaveLength(20)
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

describe('param length budget (Meta 1024-char rendered body cap)', () => {
  const render = (
    locale: (typeof LOCALES)[number],
    type: 'homework_assignment' | 'homework_graded',
    vars: Record<string, string>
  ) => {
    const approved = APPROVED_TEMPLATES[locale][type]!
    const registered = TEMPLATES.find((t) => t.name === approved.name)!
    let rendered: string = registered.bodyText ?? ''
    const body = approved.buildComponents(vars)[0]
    if (body.type !== 'body') throw new Error('expected body component')
    body.parameters.forEach((p, i) => {
      if (p.type !== 'text') throw new Error('expected text param')
      expect(p.text).not.toMatch(/[\n\t]/)
      rendered = rendered.replace(`{{${i + 1}}}`, p.text)
    })
    return rendered
  }

  it('leaves short values untouched', () => {
    expect(param('עמ׳ 45–47', 'x', 150).text).toBe('עמ׳ 45–47')
  })

  it('truncates over-long values with an ellipsis at the limit', () => {
    const out = param('a'.repeat(2000), 'x', 600).text
    expect(out.length).toBe(600)
    expect(out.endsWith('…')).toBe(true)
  })

  it('keeps a worst-case homework_assignment under the cap in both languages', () => {
    const vars = { title: 'ת'.repeat(3000), body: 'ב'.repeat(5000), due_line: '\nלהגשה עד: 31/12/2026' }
    for (const locale of LOCALES) {
      expect(render(locale, 'homework_assignment', vars).length, locale).toBeLessThanOrEqual(1024)
    }
  })

  it('keeps a worst-case homework_graded under the cap in both languages', () => {
    const vars = { title: 'ת'.repeat(3000), score: '92', feedback_line: 'מ'.repeat(5000) }
    for (const locale of LOCALES) {
      expect(render(locale, 'homework_graded', vars).length, locale).toBeLessThanOrEqual(1024)
    }
  })

  it('budgets sum to well under the cap', () => {
    expect(PARAM_LIMITS.homework_title + PARAM_LIMITS.homework_body).toBeLessThan(900)
  })
})
