/**
 * The invariants that keep the settings preview honest.
 *
 * Every one of these encodes a bug that actually shipped: a preview drawing a
 * link the parent never sees, Hebrew sample values under an English template,
 * a button declared for a message that carries none, a currency symbol printed
 * twice. A table-driven sweep over all types × both languages is cheaper than
 * re-reading twenty cards by hand after every copy change.
 */

import { describe, it, expect } from 'vitest'
import {
  DEFAULT_TEMPLATES,
  TEMPLATE_LABELS,
  TEMPLATE_PREVIEW_VARS,
  TEMPLATE_VARIABLES,
  stripStandaloneVarLine,
  type MessageTemplateType,
} from './templates'
import { TEMPLATE_BUTTONS, buttonsFor } from './templateButtons'
import { botString } from './strings'
import { TEMPLATES, metaTemplateBody } from './registerTemplates'
import {
  getApprovedTemplate,
  LESSON_CANCELLED_BY_TEACHER_TEMPLATE,
  QUICK_REPLY_TEMPLATES,
  URL_BUTTON_TEMPLATES,
  URL_BUTTON_TEMPLATES_V4,
} from './approvedTemplates'
import type { AppLocale } from '@/lib/i18n/locale'

const LOCALES: AppLocale[] = ['he', 'en']
const TYPES = Object.keys(DEFAULT_TEMPLATES.he) as MessageTemplateType[]
const HEBREW = /[\u0590-\u05FF]/

/** Variables a body may use without advertising them in the settings UI. */
const UNADVERTISED: Partial<Record<MessageTemplateType, string[]>> = {
  // Kept for orgs whose customised body predates Sprint 28; the portal holds
  // the breakdown now, so the chip is deliberately not offered.
  balance_reply: ['charge_lines'],
}

/**
 * Variables offered as a chip that the DEFAULT body does not use.
 *
 * Allowed only where the send site really supplies the value, so an owner who
 * adds the chip gets a number rather than empty text. Anything not listed here
 * is a dead chip: it inserts a placeholder nothing will ever fill.
 */
const OPTIONAL_IN_DEFAULT: Partial<Record<MessageTemplateType, string[]>> = {
  // handleReceiptQuery passes `total` (webhook/route.ts); the stock copy lists
  // the payments without summing them, but an owner may want the sum.
  payment_history_reply: ['total'],
}

function varsIn(body: string): string[] {
  return [...body.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort()
}

describe('template tables cover every type in every language', () => {
  for (const locale of LOCALES) {
    it(`${locale}: DEFAULT_TEMPLATES, TEMPLATE_LABELS and TEMPLATE_PREVIEW_VARS are complete`, () => {
      for (const type of TYPES) {
        expect(DEFAULT_TEMPLATES[locale][type], `body ${locale}/${type}`).toBeTruthy()
        expect(TEMPLATE_LABELS[locale][type], `label ${locale}/${type}`).toBeTruthy()
        expect(TEMPLATE_PREVIEW_VARS[locale][type], `vars ${locale}/${type}`).toBeDefined()
      }
    })
  }
})

describe('declared variables and body placeholders agree', () => {
  for (const locale of LOCALES) {
    for (const type of TYPES) {
      it(`${locale}/${type}`, () => {
        const used = varsIn(DEFAULT_TEMPLATES[locale][type])
        const declared = TEMPLATE_VARIABLES[type] ?? []
        const allowed = [...declared, ...(UNADVERTISED[type] ?? [])]

        for (const v of used) {
          expect(allowed, `{{${v}}} is used but not declared`).toContain(v)
        }
        // A declared-but-unused variable puts a chip in the editor that does
        // nothing when clicked, unless it is a documented optional.
        const optional = OPTIONAL_IN_DEFAULT[type] ?? []
        for (const v of declared) {
          if (optional.includes(v)) continue
          expect(used, `{{${v}}} is declared but the body never uses it`).toContain(v)
        }
      })
    }
  }
})

describe('the two languages stay structurally identical', () => {
  for (const type of TYPES) {
    it(`${type} uses the same variables in he and en`, () => {
      expect(varsIn(DEFAULT_TEMPLATES.en[type])).toEqual(varsIn(DEFAULT_TEMPLATES.he[type]))
    })
  }
})

describe('every declared variable has a sample value', () => {
  for (const locale of LOCALES) {
    for (const type of TYPES) {
      it(`${locale}/${type}`, () => {
        const samples = TEMPLATE_PREVIEW_VARS[locale][type]
        for (const v of TEMPLATE_VARIABLES[type] ?? []) {
          expect(Object.keys(samples), `no sample for {{${v}}}`).toContain(v)
        }
      })
    }
  }
})

describe('English is really English', () => {
  it('no Hebrew in any en default body', () => {
    for (const type of TYPES) {
      expect(DEFAULT_TEMPLATES.en[type], type).not.toMatch(HEBREW)
    }
  })

  it('no Hebrew in any en sample value — these reach the owner and Meta', () => {
    for (const type of TYPES) {
      for (const [name, value] of Object.entries(TEMPLATE_PREVIEW_VARS.en[type])) {
        expect(value, `${type}.${name}`).not.toMatch(HEBREW)
      }
    }
  })
})

describe('no literal currency symbol in a template body', () => {
  // Amounts arrive pre-formatted for the org's currency, so a '₪' here would
  // both double up and ignore a non-ILS org's setting.
  for (const locale of LOCALES) {
    it(locale, () => {
      for (const type of TYPES) {
        expect(DEFAULT_TEMPLATES[locale][type], `${locale}/${type}`).not.toContain('₪')
      }
    })
  }
})

describe('a URL button can always be lifted out cleanly', () => {
  const withUrlButton = TYPES.filter((t) => buttonsFor(t).some((b) => b.kind === 'url'))

  it('there is at least one such type (guards against a vacuous sweep)', () => {
    expect(withUrlButton.length).toBeGreaterThan(0)
  })

  for (const type of withUrlButton) {
    const urlVar = buttonsFor(type).find((b) => b.kind === 'url')!.urlVar
    for (const locale of LOCALES) {
      it(`${locale}/${type} strips to valid copy`, () => {
        expect(urlVar, `${type} declares a url button with no urlVar`).toBeTruthy()

        const stripped = stripStandaloneVarLine(DEFAULT_TEMPLATES[locale][type], urlVar!)
        // null means the senders keep the text form and drop the button — fine
        // for an org's own copy, but never for a Lessio default.
        expect(stripped, `${locale}/${type}: {{${urlVar}}} is not on its own line`).not.toBeNull()

        const lastLine = stripped!.split('\n').filter((l) => l.trim()).pop() ?? ''
        // An orphaned "לתשלום מאובטח:" sitting above a button that says the
        // same words is exactly what this rule exists to prevent.
        expect(lastLine.trimEnd().endsWith(':'), `${locale}/${type}: orphan label "${lastLine}"`).toBe(false)
        expect(lastLine.includes('👇'), `${locale}/${type}: dangling arrow "${lastLine}"`).toBe(false)
      })
    }
  }
})

describe('declared buttons match what is registered at Meta', () => {
  for (const [type, buttons] of Object.entries(TEMPLATE_BUTTONS)) {
    for (const button of buttons ?? []) {
      if (button.editable) continue
      for (const locale of LOCALES) {
        it(`${locale}/${type}: "${button.labelKey}" matches the approved label`, () => {
          const label = botString(button.labelKey, locale)
          const registered = TEMPLATES.flatMap((t) =>
            t.language === locale
              ? (((t.rawComponents ?? []) as Array<Record<string, unknown>>)
                  .find((c) => c.type === 'BUTTONS')?.buttons as
                  | Array<{ text: string }>
                  | undefined) ?? []
              : []
          ).map((b) => b.text)

          expect(
            registered,
            `"${label}" is shown as a locked, Meta-approved label but no registered template uses it`
          ).toContain(label)
        })
      }
    }
  }

  it('a url button always declares the variable it replaces', () => {
    for (const [type, buttons] of Object.entries(TEMPLATE_BUTTONS)) {
      for (const button of buttons ?? []) {
        if (button.kind !== 'url') continue
        expect(button.urlVar, `${type} has a url button with no urlVar`).toBeTruthy()
        expect(
          varsIn(DEFAULT_TEMPLATES.he[type as MessageTemplateType]),
          `${type} declares urlVar {{${button.urlVar}}} its body never uses`
        ).toContain(button.urlVar!)
      }
    }
  })
})

describe('every template the senders reference is actually registered', () => {
  // A name in one of these registries that registerTemplatesForWABA never
  // POSTs is a send that fails at Meta with "template does not exist" — and
  // only outside the 24h window, so it never shows up in local testing.
  const registered = new Set(TEMPLATES.map((t) => t.name))

  const referenced: Array<[string, string]> = []
  for (const locale of LOCALES) {
    for (const type of TYPES) {
      const v2 = getApprovedTemplate(type, locale)
      if (v2) referenced.push([`v2 ${locale}/${type}`, v2.name])
      const v3 =
        URL_BUTTON_TEMPLATES[type]?.[locale]?.name ?? QUICK_REPLY_TEMPLATES[type]?.[locale]?.name
      if (v3) referenced.push([`v3 ${locale}/${type}`, v3])
      const v4 = URL_BUTTON_TEMPLATES_V4[type]?.[locale]?.name
      if (v4) referenced.push([`v4 ${locale}/${type}`, v4])
    }
    referenced.push([
      `cancelled-by-teacher ${locale}`,
      LESSON_CANCELLED_BY_TEACHER_TEMPLATE[locale].name,
    ])
  }

  it('covers something (guards against a vacuous sweep)', () => {
    expect(referenced.length).toBeGreaterThan(20)
  })

  for (const [label, name] of referenced) {
    it(`${label} → ${name}`, () => {
      expect(registered, `${name} is referenced but never registered`).toContain(name)
    })
  }
})

describe('v3 and v4 differ only in who prints the currency symbol', () => {
  // They take differently-shaped parameters for the same amount, so a body that
  // drifts apart in any other way means the send path picks the wrong one.
  for (const locale of LOCALES) {
    for (const type of ['payment_request', 'payment_reminder'] as const) {
      it(`${locale}/${type}`, () => {
        const v3 = metaTemplateBody(URL_BUTTON_TEMPLATES[type]![locale].name)!
        const v4 = metaTemplateBody(URL_BUTTON_TEMPLATES_V4[type]![locale].name)!

        expect(v3.text).toContain('₪')
        expect(v4.text).not.toContain('₪')
        expect(v3.text.replace('₪', '')).toBe(v4.text)
        // Same button, or the two versions offer the parent different actions.
        expect(v4.buttons).toEqual(v3.buttons)
      })
    }
  }
})
