/**
 * CLAUDE.md requires DEFAULT_TEMPLATES to stay byte-identical between the Node
 * bot and the Deno Edge Functions. Nothing enforced it, and it had already
 * drifted: the Deno union was missing `lesson_rescheduled` entirely, so an Edge
 * Function resolving that type fell through to the Hebrew default for everyone.
 *
 * supabase/functions/_shared/templates.ts has no imports, so Vitest can load it
 * directly and compare the real values rather than diffing the files — which
 * would only ever report the CRLF/LF difference between the two trees.
 */

import { describe, it, expect } from 'vitest'
import { DEFAULT_TEMPLATES as NODE_TEMPLATES } from './templates'
import { botString as nodeBotString, BOT_STRING_KEYS } from './strings'
import { DEFAULT_TEMPLATES as DENO_TEMPLATES } from '../../../supabase/functions/_shared/templates'
import { botString as denoBotString } from '../../../supabase/functions/_shared/botStrings'
import type { AppLocale } from '@/lib/i18n/locale'

const LOCALES: AppLocale[] = ['he', 'en']

describe('DEFAULT_TEMPLATES: Node ↔ Deno', () => {
  it('covers exactly the same template types', () => {
    for (const locale of LOCALES) {
      expect(Object.keys(DENO_TEMPLATES[locale]).sort()).toEqual(
        Object.keys(NODE_TEMPLATES[locale]).sort()
      )
    }
  })

  for (const locale of LOCALES) {
    it(`${locale}: every body is identical`, () => {
      expect(DENO_TEMPLATES[locale]).toEqual(NODE_TEMPLATES[locale])
    })
  }
})

describe('bot strings: the Deno subset agrees with Node', () => {
  // The Deno table is deliberately a subset — Edge Functions use a handful of
  // fragments. Every key it DOES carry must read the same, or a reminder sent
  // by a cron and the same reminder sent by the webhook disagree.
  const denoKeys = BOT_STRING_KEYS.filter((key) => {
    try {
      return denoBotString(key as never, 'he') !== undefined
    } catch {
      return false
    }
  })

  for (const locale of LOCALES) {
    it(`${locale}: shared keys match`, () => {
      const mismatched: string[] = []
      for (const key of denoKeys) {
        const deno = denoBotString(key as never, locale)
        // A key the Deno table lacks returns the key itself or undefined,
        // depending on the implementation — either way it is not a mismatch.
        if (!deno || deno === key) continue
        const node = nodeBotString(key, locale)
        // The two substitute different brace styles, so compare only the
        // literal keys — those carrying a placeholder are exercised elsewhere.
        if (node.includes('{{') || deno.includes('{')) continue
        if (node !== deno) mismatched.push(`${key}: node="${node}" deno="${deno}"`)
      }
      expect(mismatched).toEqual([])
    })
  }

  it('the button labels shown in the preview match the Deno senders', () => {
    for (const locale of LOCALES) {
      for (const key of ['btn_confirm_attendance', 'btn_need_to_cancel', 'btn_homework_done', 'cta_pay_now'] as const) {
        expect(denoBotString(key, locale), `${locale}/${key}`).toBe(nodeBotString(key, locale))
      }
    }
  })
})
