import { describe, it, expect } from 'vitest'
import he from '../../../messages/he.json'
import en from '../../../messages/en.json'

/**
 * Guards the next-intl catalogs.
 *
 * `src/i18n/request.ts` loads exactly one catalog per request — there is no
 * `getMessageFallback` and no cross-locale fallback. So a key present in `he`
 * but missing from `en` does not degrade to Hebrew: it renders the raw key path
 * (`settings.whatsapp.title`) to an English user. These tests are the only
 * thing standing between that and production.
 */

const HEBREW = /[֐-׿]/

type Json = Record<string, unknown>

function flatten(obj: Json, prefix = ''): Map<string, string> {
  const out = new Map<string, string>()
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      for (const [k, v] of flatten(value as Json, path)) out.set(k, v)
    } else {
      out.set(path, String(value))
    }
  }
  return out
}

/** ICU placeholder names, e.g. `{count}` in "You have {count} lessons". */
function placeholders(message: string): string[] {
  return [...message.matchAll(/\{(\w+)/g)].map((m) => m[1]).sort()
}

const heFlat = flatten(he as Json)
const enFlat = flatten(en as Json)

describe('message catalogs', () => {
  it('have identical key sets', () => {
    const missingFromEn = [...heFlat.keys()].filter((k) => !enFlat.has(k))
    const missingFromHe = [...enFlat.keys()].filter((k) => !heFlat.has(k))

    expect(missingFromEn, 'keys in he.json missing from en.json').toEqual([])
    expect(missingFromHe, 'keys in en.json missing from he.json').toEqual([])
  })

  it('have no Hebrew text in the English catalog', () => {
    // `₪` is deliberately kept in both languages — the product is Israeli — so
    // only Hebrew letters are checked here, not the currency glyph.
    const leaked = [...enFlat.entries()]
      .filter(([, value]) => HEBREW.test(value))
      .map(([key, value]) => `${key}: ${value}`)

    expect(leaked, 'untranslated Hebrew in en.json').toEqual([])
  })

  it('have matching ICU placeholders for every key', () => {
    const mismatched = [...heFlat.entries()]
      .filter(([key, heValue]) => {
        const enValue = enFlat.get(key)
        if (enValue === undefined) return false // reported by the key-set test
        return placeholders(heValue).join(',') !== placeholders(enValue).join(',')
      })
      .map(([key]) => key)

    expect(mismatched, 'ICU placeholder mismatch between catalogs').toEqual([])
  })

  it('have no empty English values', () => {
    const empty = [...enFlat.entries()]
      .filter(([key, value]) => value.trim() === '' && heFlat.get(key)?.trim() !== '')
      .map(([key]) => key)

    expect(empty, 'empty en.json values whose Hebrew counterpart has content').toEqual([])
  })
})
