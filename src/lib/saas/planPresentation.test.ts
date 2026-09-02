import { describe, expect, it } from 'vitest'

import {
  PLAN_UI,
  PURCHASABLE_PLAN_NAMES,
  TRIAL_ENTITLEMENT_PLAN,
  isPurchasablePlanName,
} from './planPresentation'
import heMessages from '../../../messages/he.json'
import enMessages from '../../../messages/en.json'

const CATALOGS = { he: heMessages, en: enMessages } as Record<string, Record<string, unknown>>

function lookup(catalog: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((node, key) => {
    if (node && typeof node === 'object') return (node as Record<string, unknown>)[key]
    return undefined
  }, catalog)
}

describe('PLAN_UI', () => {
  /**
   * The upgrade panel derives its bullet key from the plan, so a plan with no
   * copy throws a missing-message error at render time — on the billing page, to
   * a customer trying to give us money.
   *
   * Scoped to the plans that can actually render a card there: the purchasable
   * tiers, plus the RETIRED ones, because a customer still holding `basic` or
   * `advanced` sees their own plan. `free` and `custom` never appear in the
   * upgrade panel and have no bullets under this namespace.
   */
  const PLANS_RENDERED_IN_UPGRADE_PANEL = [
    ...PURCHASABLE_PLAN_NAMES,
    'basic',
    'advanced',
  ] as const

  it('gives every upgrade-panel plan a bullet list that resolves in both catalogs', () => {
    const missing: string[] = []

    for (const planName of PLANS_RENDERED_IN_UPGRADE_PANEL) {
      const ui = PLAN_UI[planName]
      for (const [lang, catalog] of Object.entries(CATALOGS)) {
        const path = `saas.accountBilling.upgrade.plans.${ui.i18nKey}.bullets`
        const value = lookup(catalog, path)
        if (!Array.isArray(value) || value.length === 0) {
          missing.push(`${lang}: ${planName} → ${path}`)
        }
      }
    }

    expect(missing, missing.join('\n')).toEqual([])
  })

  it('gives every purchasable plan onboarding copy in both catalogs', () => {
    const missing: string[] = []

    for (const planName of PURCHASABLE_PLAN_NAMES) {
      for (const [lang, catalog] of Object.entries(CATALOGS)) {
        for (const field of ['title', 'tagline', 'bestFor', 'cta', 'bullets']) {
          const path = `onboarding.planSelection.plans.${planName}.${field}`
          if (lookup(catalog, path) == null) missing.push(`${lang}: ${path}`)
        }
      }
    }

    expect(missing, missing.join('\n')).toEqual([])
  })

  it('features exactly one tier — the one most customers land on', () => {
    const featured = Object.entries(PLAN_UI).filter(([, ui]) => ui.featured)
    expect(featured.map(([name]) => name)).toEqual(['studio'])
  })
})

describe('purchasable tiers', () => {
  it('excludes free, custom, and every retired tier', () => {
    expect(isPurchasablePlanName('solo')).toBe(true)
    expect(isPurchasablePlanName('studio')).toBe(true)
    expect(isPurchasablePlanName('center')).toBe(true)
    expect(isPurchasablePlanName('free')).toBe(false)
    expect(isPurchasablePlanName('custom')).toBe(false)
    expect(isPurchasablePlanName('basic')).toBe(false)
    expect(isPurchasablePlanName('advanced')).toBe(false)
  })

  it('entitles a trial to a tier that is actually on sale', () => {
    // If the trial plan were ever a retired name, getSaasPlanByName would return
    // null and the trial path would silently grant every feature instead.
    expect(isPurchasablePlanName(TRIAL_ENTITLEMENT_PLAN)).toBe(true)
  })
})
