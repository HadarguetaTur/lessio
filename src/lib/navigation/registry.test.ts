import { describe, it, expect } from 'vitest'
import {
  SETTINGS_NAV,
  REPORTS_NAV,
  MAIN_NAV,
  SEARCHABLE_PAGES,
  filterNav,
  matchPages,
  resolveBreadcrumb,
  isNavActive,
} from './registry'

describe('registry shape', () => {
  it('has no duplicate hrefs across the whole registry', () => {
    const hrefs = SEARCHABLE_PAGES.map((e) => e.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })

  it('covers /account/billing plus the sixteen settings pages', () => {
    expect(SETTINGS_NAV).toHaveLength(17)
    expect(SETTINGS_NAV.filter((e) => e.cardKey)).toHaveLength(16)
  })

  it('keeps every settings page reachable from the sidebar and the hub', () => {
    // The three the sidebar was missing before the registry existed.
    const hrefs = SETTINGS_NAV.map((e) => e.href)
    expect(hrefs).toContain('/settings/pricing')
    expect(hrefs).toContain('/settings/privacy')
    expect(hrefs).toContain('/settings/calendar')
  })

  it('leaves revenue ungated and gates the other reports on full_reports', () => {
    const revenue = REPORTS_NAV.find((e) => e.href === '/reports/revenue')
    expect(revenue?.saasFeature).toBeUndefined()
    const others = REPORTS_NAV.filter((e) => e.href !== '/reports/revenue')
    expect(others.every((e) => e.saasFeature === 'full_reports')).toBe(true)
    expect(REPORTS_NAV).toHaveLength(6)
  })
})

describe('filterNav', () => {
  const features = {
    whatsapp_automation: false,
    ai_assistant: false,
    full_reports: false,
    leads: true,
    homework: true,
    parent_portal: true,
    integrations: false,
  }

  it('hides owner-only entries from an admin', () => {
    const admin = filterNav(SETTINGS_NAV, 'admin').map((e) => e.href)
    expect(admin).toEqual(['/settings/exams', '/settings/holidays', '/settings/locale'])
  })

  it('shows everything to an owner when no plan is resolved', () => {
    expect(filterNav(SETTINGS_NAV, 'owner')).toHaveLength(17)
  })

  it('drops plan-gated entries when the feature is off', () => {
    const hrefs = filterNav(SETTINGS_NAV, 'owner', features).map((e) => e.href)
    expect(hrefs).not.toContain('/settings/whatsapp')
    expect(hrefs).not.toContain('/settings/message-templates')
    expect(hrefs).not.toContain('/settings/ai-assistant')
    expect(hrefs).not.toContain('/settings/integrations')
    expect(hrefs).toContain('/settings/payment')
  })

  it('keeps revenue on a plan without full_reports', () => {
    const hrefs = filterNav(REPORTS_NAV, 'owner', features).map((e) => e.href)
    expect(hrefs).toEqual(['/reports/revenue'])
  })

  it('treats undefined features as "show everything"', () => {
    expect(filterNav(MAIN_NAV, 'owner')).toHaveLength(MAIN_NAV.length)
  })
})

describe('isNavActive', () => {
  it('does not mark a parent nav item active when a deeper sibling is selected', () => {
    const hrefs = ['/billing', '/billing/debts', '/reports/revenue', '/reports/debt']
    expect(isNavActive('/billing/debts', '/billing', hrefs)).toBe(false)
    expect(isNavActive('/billing/debts', '/billing/debts', hrefs)).toBe(true)
    expect(isNavActive('/reports/debt', '/reports/revenue', hrefs)).toBe(false)
  })
})

describe('resolveBreadcrumb', () => {
  it('gives a section hub no ancestor of its own', () => {
    expect(resolveBreadcrumb('/settings')).toEqual({
      sectionKey: null,
      sectionHref: null,
      pageKey: 'sections.settings',
    })
  })

  it('links the ancestor of a settings page back to the hub', () => {
    expect(resolveBreadcrumb('/settings/reminders')).toEqual({
      sectionKey: 'sections.settings',
      sectionHref: '/settings',
      pageKey: 'settingsReminders',
    })
  })

  it('resolves the routes that used to render a raw URL slug', () => {
    const cases: [string, string][] = [
      ['/messages', 'messages'],
      ['/account/billing', 'accountBilling'],
      ['/settings/email', 'settingsEmail'],
      ['/settings/calendar', 'settingsCalendar'],
      ['/settings/business-profile', 'settingsBusinessProfile'],
      ['/settings/pricing', 'settingsPricing'],
      ['/settings/privacy', 'settingsPrivacy'],
      ['/reports/teacher-performance', 'reportsTeacherPerformance'],
    ]
    for (const [pathname, pageKey] of cases) {
      expect(resolveBreadcrumb(pathname).pageKey, pathname).toBe(pageKey)
    }
  })

  it('falls back to the parent path for a dynamic segment', () => {
    expect(resolveBreadcrumb('/students/abc-123').pageKey).toBe('students')
  })

  it('falls back to the grandparent path two segments deep', () => {
    expect(resolveBreadcrumb('/students/abc-123/parents').pageKey).toBe('students')
  })

  it('does not invent a section for a top-level page', () => {
    expect(resolveBreadcrumb('/students').sectionKey).toBeNull()
  })

  it('returns a null page key rather than guessing for an unknown route', () => {
    expect(resolveBreadcrumb('/nope/at/all').pageKey).toBeNull()
  })

  it('reads /billing/debts as its own page, not as billing', () => {
    expect(resolveBreadcrumb('/billing/debts').pageKey).toBe('debts')
  })
})

describe('matchPages', () => {
  // Stands in for next-intl: the Hebrew UI title of each page.
  const heTitles: Record<string, string> = {
    settingsReminders: 'תזכורות',
    settingsCancellation: 'מדיניות ביטולים',
    settingsWhatsApp: 'WhatsApp',
    settingsPayment: 'תשלומים',
    students: 'תלמידים',
  }
  const heTitle = (e: { navKey: string }) => heTitles[e.navKey] ?? e.navKey

  it('ignores a query shorter than two characters', () => {
    expect(matchPages('t', SEARCHABLE_PAGES, heTitle)).toEqual([])
    expect(matchPages('', SEARCHABLE_PAGES, heTitle)).toEqual([])
    expect(matchPages('  ', SEARCHABLE_PAGES, heTitle)).toEqual([])
  })

  it('finds a settings page by its Hebrew title', () => {
    const hrefs = matchPages('תזכור', SEARCHABLE_PAGES, heTitle).map((e) => e.href)
    expect(hrefs).toContain('/settings/reminders')
  })

  it('finds the same page typed in English inside a Hebrew UI', () => {
    // The whole reason synonyms mix both languages: heTitle only knows Hebrew.
    const hrefs = matchPages('reminder', SEARCHABLE_PAGES, heTitle).map((e) => e.href)
    expect(hrefs).toContain('/settings/reminders')
  })

  it('covers the four routes the audit could not reach by search', () => {
    const cases: [string, string][] = [
      ['reminder', '/settings/reminders'],
      ['חוב', '/settings/reminders'],
      ['ביטול', '/settings/cancellation-policy'],
      ['בוט', '/settings/whatsapp'],
      ['סליקה', '/settings/payment'],
    ]
    for (const [query, href] of cases) {
      const hrefs = matchPages(query, SEARCHABLE_PAGES, heTitle).map((e) => e.href)
      expect(hrefs, query).toContain(href)
    }
  })

  it('is case-insensitive', () => {
    const lower = matchPages('whatsapp', SEARCHABLE_PAGES, heTitle).map((e) => e.href)
    const upper = matchPages('WhatsApp', SEARCHABLE_PAGES, heTitle).map((e) => e.href)
    expect(upper).toEqual(lower)
    expect(lower).toContain('/settings/whatsapp')
  })

  it('caps the result list', () => {
    expect(matchPages('e', SEARCHABLE_PAGES, heTitle, 3).length).toBeLessThanOrEqual(3)
    expect(matchPages('te', SEARCHABLE_PAGES, heTitle, 3).length).toBeLessThanOrEqual(3)
    expect(matchPages('te', SEARCHABLE_PAGES, heTitle).length).toBeLessThanOrEqual(5)
  })

  it('searches only the entries it is handed', () => {
    const owner = filterNav(SEARCHABLE_PAGES, 'teacher')
    const hrefs = matchPages('תזכור', owner, heTitle).map((e) => e.href)
    expect(hrefs).not.toContain('/settings/reminders')
  })

  it('returns nothing for a query that matches no page', () => {
    expect(matchPages('zzzqqq', SEARCHABLE_PAGES, heTitle)).toEqual([])
  })
})
