import { describe, it, expect } from 'vitest'
import {
  SETTINGS_NAV,
  ACCOUNT_NAV,
  SETTINGS_GROUPS,
  CONNECTIONS_HUB,
  settingsGroupFor,
  REPORTS_NAV,
  MAIN_NAV,
  SEARCHABLE_PAGES,
  CATEGORIES,
  categoryFor,
  filterNav,
  matchPages,
  resolveBreadcrumb,
  isNavActive,
} from './registry'
import heMessages from '../../../messages/he.json'

describe('registry shape', () => {
  it('has no duplicate hrefs across the whole registry', () => {
    const hrefs = SEARCHABLE_PAGES.map((e) => e.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })

  it('keeps platform billing separate from the nineteen business settings pages', () => {
    expect(ACCOUNT_NAV.map((entry) => entry.href)).toEqual(['/account/billing'])
    expect(SETTINGS_NAV).toHaveLength(19)
    expect(SETTINGS_NAV.filter((e) => e.cardKey)).toHaveLength(19)
    expect(SETTINGS_NAV.map((entry) => entry.href)).not.toContain('/account/billing')
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
    data_retention: false,
  }

  it('hides owner-only entries from an admin', () => {
    const admin = filterNav(SETTINGS_NAV, 'admin').map((e) => e.href)
    expect(admin).toEqual([
      '/settings/exams',
      '/settings/scheduling',
      '/settings/holidays',
      // Deciding what parents may see and do is day-to-day operations, not a
      // business or money setting, so an admin gets it too.
      '/settings/parent-portal',
      '/settings/locale',
    ])
  })

  it('shows everything to an owner when no plan is resolved', () => {
    expect(filterNav(SETTINGS_NAV, 'owner')).toHaveLength(19)
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
    debts: 'גבייה',
    reportsDebt: 'דוח יתרות',
    billing: 'חיוב חודשי',
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

  it('ranks a page whose own name matches above one that only lists it as a synonym', () => {
    // /billing and /settings/reminders both sit earlier in the registry than
    // /billing/debts, so registry order alone put the page actually called
    // גבייה below them.
    const hrefs = matchPages('גבייה', SEARCHABLE_PAGES, heTitle).map((e) => e.href)
    expect(hrefs[0]).toBe('/billing/debts')
  })

  it('still finds the two renamed money pages under their old names', () => {
    // Renaming a page must not make it unfindable for anyone who learned it
    // as 'חייבים' or 'דוח חובות'.
    const cases: [string, string][] = [
      ['חייבים', '/billing/debts'],
      ['חובות', '/billing/debts'],
      ['debtors', '/billing/debts'],
      ['יתרות', '/reports/debt'],
      ['balances', '/reports/debt'],
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

describe('categories', () => {
  it('covers every working page exactly once (dashboard, messages and support stay out)', () => {
    const inCategories = CATEGORIES.flatMap((c) => c.items.map((i) => i.href))
    expect(new Set(inCategories).size).toBe(inCategories.length)

    const expected = [
      ...MAIN_NAV.map((e) => e.href).filter(
        (h) => !['/dashboard', '/messages', '/support'].includes(h)
      ),
      ...REPORTS_NAV.map((e) => e.href),
    ]
    expect(new Set(inCategories)).toEqual(new Set(expected))
  })

  it('lands every category on an ungated owner+admin page', () => {
    for (const category of CATEGORIES) {
      const landing = category.items.find((i) => i.href === category.landing)
      expect(landing, category.id).toBeDefined()
      expect(landing?.saasFeature, category.id).toBeUndefined()
      for (const role of ['owner', 'admin'] as const) {
        expect(filterNav([landing!], role).length, `${category.id}/${role}`).toBe(1)
      }
    }
  })

  it('maps each item href back to its own category', () => {
    for (const category of CATEGORIES) {
      for (const item of category.items) {
        expect(categoryFor(item.href)?.id, item.href).toBe(category.id)
      }
    }
  })

  it('resolves nested and ambiguous paths by the longest match', () => {
    expect(categoryFor('/parents')?.id).toBe('students')
    // /billing/debts has its own entry — it must not fall into /billing's prefix.
    expect(categoryFor('/billing/debts')?.id).toBe('money')
    expect(categoryFor('/students/abc-123')?.id).toBe('students')
    expect(categoryFor('/reports/teacher-performance')?.id).toBe('teachers')
  })

  it('claims nothing outside the four categories', () => {
    for (const path of ['/dashboard', '/messages', '/settings', '/settings/whatsapp', '/reports', '/teacher/schedule', '/support']) {
      expect(categoryFor(path), path).toBeNull()
    }
  })

  it('gives sibling pages a category breadcrumb, and the landing page none', () => {
    expect(resolveBreadcrumb('/parents')).toEqual({
      sectionKey: 'sections.students',
      sectionHref: '/students',
      pageKey: 'parents',
    })
    // A category beats the /reports hub for report pages.
    expect(resolveBreadcrumb('/reports/students')).toEqual({
      sectionKey: 'sections.students',
      sectionHref: '/students',
      pageKey: 'reportsStudents',
    })
    expect(resolveBreadcrumb('/billing/debts').sectionKey).toBe('sections.money')
    // "תלמידים ‹ תלמידים" says nothing — landings carry no section.
    expect(resolveBreadcrumb('/students').sectionKey).toBeNull()
    // Settings pages keep their hub breadcrumb exactly as before.
    expect(resolveBreadcrumb('/settings/reminders').sectionKey).toBe('sections.settings')
  })

  it('shows no two identical Hebrew labels inside one tab strip', () => {
    const nav = heMessages.nav as Record<string, unknown>
    for (const category of CATEGORIES) {
      const labels = category.items.map((i) => nav[i.navKey])
      expect(labels.every((l) => typeof l === 'string'), category.id).toBe(true)
      expect(new Set(labels).size, `${category.id}: ${labels.join(' | ')}`).toBe(labels.length)
    }
  })
})

describe('settings groups', () => {
  it('places every business setting in exactly one group', () => {
    const grouped = SETTINGS_GROUPS.flatMap((group) => group.items.map((item) => item.href))
    expect(new Set(grouped).size).toBe(grouped.length)
    expect(new Set(grouped)).toEqual(new Set(SETTINGS_NAV.map((entry) => entry.href)))
  })

  it('does not place the Lessio plan inside a business settings group', () => {
    const grouped = SETTINGS_GROUPS.flatMap((group) => group.items.map((item) => item.href))
    expect(grouped).not.toContain('/account/billing')
  })

  it('gives each settings hub a useful breadcrumb', () => {
    expect(resolveBreadcrumb('/settings/billing')).toEqual({
      sectionKey: 'sections.settings',
      sectionHref: '/settings',
      pageKey: 'settingsGroups.billing',
    })
  })

  it('keeps privacy under business and only true connections in the connections group', () => {
    const business = SETTINGS_GROUPS.find((g) => g.id === 'business')!
    expect(business.items.map((i) => i.href)).toContain('/settings/privacy')
    const connections = SETTINGS_GROUPS.find((g) => g.id === 'connections')!
    expect(connections.items.map((i) => i.href)).toEqual([
      '/settings/calendar',
      '/settings/integrations',
    ])
    expect(settingsGroupFor('/settings/privacy')?.id).toBe('business')
  })
})

describe('connections hub', () => {
  const hubEntries = CONNECTIONS_HUB.flatMap((section) => section.items)

  it('references only real settings routes, each exactly once', () => {
    const hrefs = hubEntries.map((item) => item.entry.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
    const settingsHrefs = new Set(SETTINGS_NAV.map((entry) => entry.href))
    for (const href of hrefs) expect(settingsHrefs.has(href), href).toBe(true)
    expect(new Set(hrefs)).toEqual(
      new Set([
        '/settings/payment',
        '/settings/receipts',
        '/settings/whatsapp',
        '/settings/email',
        '/settings/ai-assistant',
        '/settings/calendar',
        '/settings/integrations',
      ])
    )
  })

  it('inherits role and plan gating from the referenced entries', () => {
    const features = {
      whatsapp_automation: false,
      ai_assistant: false,
      full_reports: false,
      leads: true,
      homework: true,
      parent_portal: true,
      integrations: false,
      data_retention: false,
    }
    const visible = filterNav(hubEntries.map((i) => i.entry), 'owner', features).map(
      (e) => e.href
    )
    expect(visible).not.toContain('/settings/whatsapp')
    expect(visible).not.toContain('/settings/ai-assistant')
    expect(visible).not.toContain('/settings/integrations')
    expect(visible).toContain('/settings/payment')
  })

  it('does not steal tab highlight from the functional groups', () => {
    // /settings/payment appears on the hub but still belongs to the billing tab.
    expect(settingsGroupFor('/settings/payment')?.id).toBe('billing')
    expect(settingsGroupFor('/settings/whatsapp')?.id).toBe('communications')
    expect(settingsGroupFor('/settings/calendar')?.id).toBe('connections')
  })
})
