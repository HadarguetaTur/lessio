import { describe, it, expect } from 'vitest'
import { botString, BOT_STRING_KEYS, type BotStringKey } from './strings'

const LOCALES = ['he', 'en'] as const

/**
 * botString substitutes {{double}} braces only. Four keys shipped with single
 * braces and silently sent their placeholders to real users — a parent with
 * upcoming lessons was told "1. {date} בשעה {time} עם {teacher}". These tests
 * exist so that class of typo cannot ship again.
 */
describe('botString placeholders', () => {
  it('leaves no unsubstituted brace in any string, in any language', () => {
    const offenders: string[] = []

    for (const locale of LOCALES) {
      for (const key of BOT_STRING_KEYS) {
        // Rendering with no vars returns the raw template: botString leaves a
        // placeholder alone when the caller did not supply it.
        const template = botString(key, locale, {})
        const names = [...template.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1])
        const vars = Object.fromEntries(names.map((name) => [name, `«${name}»`]))

        const rendered = botString(key, locale, vars)
        // Anything brace-shaped left is a malformed placeholder — most likely a
        // single-brace {var} that botString will never substitute.
        if (/[{}]/.test(rendered)) offenders.push(`${locale}.${key}: ${rendered}`)
      }
    }

    expect(offenders).toEqual([])
  })

  it('substitutes the lesson list line that reaches parents', () => {
    const rendered = botString('lesson_list_line', 'he', {
      n: '1',
      date: 'יום ראשון',
      time: '17:00',
      teacher: 'שרה',
    })

    expect(rendered).toBe('1. יום ראשון בשעה 17:00 עם שרה')
  })

  it('falls back to Hebrew for a locale it does not know', () => {
    const key: BotStringKey = 'the_teacher'
    expect(botString(key, 'he')).toBe(botString(key, 'he'))
  })
})
