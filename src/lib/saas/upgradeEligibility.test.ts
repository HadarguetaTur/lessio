import { describe, expect, it } from 'vitest'
import { evaluateUpgrade } from './upgradeEligibility'
import type { SaasPlanRow } from './plans'
import type { OrgQuotaUsage } from './quota'

const FEATURES = {
  whatsapp_automation: true,
  ai_assistant: true,
  full_reports: true,
  leads: true,
  homework: true,
  parent_portal: true,
  integrations: true,
  data_retention: true,
}

function planRow(over: Partial<SaasPlanRow> & Pick<SaasPlanRow, 'name' | 'sort_order'>): SaasPlanRow {
  return {
    id: `plan-${over.name}`,
    display_name_he: over.name,
    display_name_en: over.name,
    price_monthly: 0,
    price_yearly: null,
    features: FEATURES,
    students_quota: null,
    lessons_monthly_quota: null,
    teachers_quota: null,
    ...over,
  }
}

// The catalog as the seat-pricing migration lays it out.
const BASIC = planRow({ name: 'basic', sort_order: 5, price_monthly: 99, students_quota: 100 })
const SOLO = planRow({ name: 'solo', sort_order: 10, price_monthly: 149, teachers_quota: 1 })
const ADVANCED = planRow({ name: 'advanced', sort_order: 15, price_monthly: 199 })
const STUDIO = planRow({ name: 'studio', sort_order: 20, price_monthly: 349, teachers_quota: 5 })
const CENTER = planRow({ name: 'center', sort_order: 30, price_monthly: 699 })

function usage(over: Partial<OrgQuotaUsage> = {}): OrgQuotaUsage {
  return {
    studentsUsed: 10,
    studentsLimit: null,
    lessonsUsed: 20,
    lessonsLimit: null,
    teachersUsed: 1,
    teachersLimit: null,
    ...over,
  }
}

describe('evaluateUpgrade — the value ladder', () => {
  it('refuses a legacy ₪199 customer the ₪149 tier', () => {
    expect(evaluateUpgrade({ current: ADVANCED, target: SOLO, usage: usage() })).toEqual({
      ok: false,
      reason: 'NOT_AN_UPGRADE',
    })
  })

  it('lets a legacy ₪99 customer move up to the ₪149 tier', () => {
    expect(
      evaluateUpgrade({ current: BASIC, target: SOLO, usage: usage({ teachersUsed: 1 }) })
    ).toEqual({ ok: true })
  })

  it('refuses a sideways move to the same tier', () => {
    expect(evaluateUpgrade({ current: STUDIO, target: STUDIO, usage: usage() })).toEqual({
      ok: false,
      reason: 'NOT_AN_UPGRADE',
    })
  })

  it('refuses a downgrade from Studio to Solo', () => {
    expect(evaluateUpgrade({ current: STUDIO, target: SOLO, usage: usage() })).toEqual({
      ok: false,
      reason: 'NOT_AN_UPGRADE',
    })
  })

  it('skips the ladder for a grandfathered org with no subscription row', () => {
    expect(evaluateUpgrade({ current: null, target: SOLO, usage: usage() })).toEqual({ ok: true })
  })
})

describe('evaluateUpgrade — usage must fit the target', () => {
  it('refuses an eight-teacher org the five-seat tier, naming the dimension', () => {
    expect(
      evaluateUpgrade({ current: ADVANCED, target: STUDIO, usage: usage({ teachersUsed: 8 }) })
    ).toEqual({ ok: false, reason: 'USAGE_EXCEEDS_TARGET', dimension: 'teachers' })
  })

  it('offers that same org the unlimited tier instead — no dead end', () => {
    expect(
      evaluateUpgrade({ current: ADVANCED, target: CENTER, usage: usage({ teachersUsed: 8 }) })
    ).toEqual({ ok: true })
  })

  it('allows a two-teacher legacy org into Studio', () => {
    expect(
      evaluateUpgrade({ current: ADVANCED, target: STUDIO, usage: usage({ teachersUsed: 2 }) })
    ).toEqual({ ok: true })
  })

  it('allows the org that exactly fills the seat count', () => {
    expect(
      evaluateUpgrade({ current: ADVANCED, target: STUDIO, usage: usage({ teachersUsed: 5 }) })
    ).toEqual({ ok: true })
  })

  it('does not compare limits — a legacy unlimited plan can still move to a capped one', () => {
    // ADVANCED carries NULL quotas on every dimension. A limit-vs-limit guard
    // would read that as "unlimited > 5" and strand the customer on the top
    // tier forever.
    expect(
      evaluateUpgrade({ current: ADVANCED, target: STUDIO, usage: usage({ teachersUsed: 1 }) })
    ).toEqual({ ok: true })
  })

  it('blocks a grandfathered org whose students overflow the target', () => {
    expect(
      evaluateUpgrade({ current: null, target: BASIC, usage: usage({ studentsUsed: 200 }) })
    ).toEqual({ ok: false, reason: 'USAGE_EXCEEDS_TARGET', dimension: 'students' })
  })

  it('names teachers first when more than one dimension overflows', () => {
    const target = planRow({ name: 'solo', sort_order: 10, teachers_quota: 1, students_quota: 5 })
    expect(
      evaluateUpgrade({
        current: BASIC,
        target,
        usage: usage({ teachersUsed: 4, studentsUsed: 90 }),
      })
    ).toMatchObject({ dimension: 'teachers' })
  })
})
