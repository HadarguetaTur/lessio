import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  ADMIN_CATEGORIES,
  ADMIN_NAV,
  ADMIN_OVERVIEW,
  adminCategoryFor,
  filterAdminNav,
  landingFor,
  matchAdminPages,
  resolveAdminBreadcrumb,
  type AdminNavEntry,
} from './adminRegistry'
import { ROLE_CAPABILITIES, capabilitiesFor } from '@/lib/superadmin/capabilities'

const ALL = [ADMIN_OVERVIEW, ...ADMIN_NAV]
const SUPERADMIN = ROLE_CAPABILITIES.superadmin

describe('every entry points at a page that exists', () => {
  // This is the regression test for the reported bug: M1 listed six pages that
  // were never built (/admin/leads, /admin/campaigns, /admin/attribution,
  // /admin/tracking, /admin/errors, /admin/cost) as live links with a "soon"
  // tag, and every one of them answered 404.
  it.each(ALL.map((e) => e.href))('%s has a route file', (href) => {
    const routeFile = join(process.cwd(), 'src/app/(admin)', href, 'page.tsx')
    expect(existsSync(routeFile), `missing route file for ${href}`).toBe(true)
  })

  it('has no duplicate hrefs', () => {
    const hrefs = ALL.map((e) => e.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })

  it('references only known routes from categories', () => {
    const known = new Set(ALL.map((e) => e.href))
    for (const category of ADMIN_CATEGORIES) {
      for (const item of category.items) expect(known.has(item.href)).toBe(true)
    }
  })

  it('places every page except the overview in exactly one category', () => {
    for (const entry of ADMIN_NAV) {
      const owning = ADMIN_CATEGORIES.filter((c) =>
        c.items.some((i) => i.href === entry.href)
      )
      expect(owning, `${entry.href} should belong to exactly one category`).toHaveLength(1)
    }
  })

  it('keeps the overview out of every category', () => {
    // It is a standalone sidebar row, like /dashboard in the tenant shell.
    for (const category of ADMIN_CATEGORIES) {
      expect(category.items.some((i) => i.href === ADMIN_OVERVIEW.href)).toBe(false)
    }
  })
})

describe('filterAdminNav', () => {
  it('shows marketing its own section and nothing else', () => {
    // The sharpest boundary in the matrix: marketing works on leads and
    // aggregate numbers and must not reach a tenant, a ticket or an invoice.
    const hrefs = filterAdminNav(ADMIN_NAV, capabilitiesFor('platform_marketing')).map(
      (e) => e.href
    )
    expect(hrefs).toContain('/admin/tracking')
    for (const forbidden of [
      '/admin/orgs',
      '/admin/support',
      '/admin/revenue',
      '/admin/subscriptions',
      '/admin/staff',
    ]) {
      expect(hrefs).not.toContain(forbidden)
    }
  })

  it('shows everything to a superadmin', () => {
    expect(filterAdminNav(ADMIN_NAV, SUPERADMIN)).toHaveLength(ADMIN_NAV.length)
  })

  it('gives support the tenant list but not billing', () => {
    const hrefs = filterAdminNav(ADMIN_NAV, capabilitiesFor('platform_support')).map(
      (e) => e.href
    )
    expect(hrefs).toContain('/admin/orgs')
    expect(hrefs).toContain('/admin/support')
    expect(hrefs).not.toContain('/admin/revenue')
    expect(hrefs).not.toContain('/admin/subscriptions')
  })

  it('gives a tenant role nothing', () => {
    expect(filterAdminNav(ADMIN_NAV, capabilitiesFor('owner'))).toEqual([])
  })

  it('leaves an ungated entry visible to anyone', () => {
    expect(ADMIN_OVERVIEW.capability).toBeUndefined()
    expect(filterAdminNav([ADMIN_OVERVIEW], [])).toHaveLength(1)
  })
})

describe('landingFor', () => {
  it('lands each category on its first visible item', () => {
    for (const category of ADMIN_CATEGORIES) {
      const landing = landingFor(category, SUPERADMIN)
      if (category.items.length === 0) {
        expect(landing).toBeNull()
        continue
      }
      expect(landing).toBe(category.items[0].href)
    }
  })

  it('never lands an operator on a page their role cannot open', () => {
    // The tenant registry pins its landings to a fixed ungated href; here the
    // landing moves, because a capability can remove the first item.
    for (const role of Object.keys(ROLE_CAPABILITIES) as (keyof typeof ROLE_CAPABILITIES)[]) {
      const caps = ROLE_CAPABILITIES[role]
      for (const category of ADMIN_CATEGORIES) {
        const landing = landingFor(category, caps)
        if (landing === null) continue
        const entry = category.items.find((i) => i.href === landing) as AdminNavEntry
        expect(!entry.capability || caps.includes(entry.capability)).toBe(true)
      }
    }
  })

  it('returns null for a category with nothing visible', () => {
    const customers = ADMIN_CATEGORIES.find((c) => c.id === 'customers')!
    expect(landingFor(customers, capabilitiesFor('platform_marketing'))).toBeNull()
  })
})

describe('adminCategoryFor', () => {
  it('matches an exact item', () => {
    expect(adminCategoryFor('/admin/orgs')?.id).toBe('customers')
    expect(adminCategoryFor('/admin/support')?.id).toBe('operations')
  })

  it('resolves a detail page through its prefix', () => {
    expect(adminCategoryFor('/admin/orgs/abc-123')?.id).toBe('customers')
    expect(adminCategoryFor('/admin/dev-issues/xyz')?.id).toBe('operations')
  })

  it('gives the overview no category', () => {
    expect(adminCategoryFor('/admin')).toBeNull()
  })

  it('does not invent a category for an unknown route', () => {
    expect(adminCategoryFor('/admin/nope')).toBeNull()
  })
})

describe('resolveAdminBreadcrumb', () => {
  it('names the overview with no section', () => {
    expect(resolveAdminBreadcrumb('/admin', SUPERADMIN)).toEqual({
      sectionKey: null,
      sectionHref: null,
      pageKey: 'overview',
    })
  })

  it('drops the section on a category landing', () => {
    // "לקוחות ‹ ארגונים" would repeat itself when /admin/orgs is the landing.
    const crumb = resolveAdminBreadcrumb('/admin/orgs', SUPERADMIN)
    expect(crumb.pageKey).toBe('orgs')
    expect(crumb.sectionHref).toBeNull()
  })

  it('keeps the section on a sibling page', () => {
    const crumb = resolveAdminBreadcrumb('/admin/revenue', SUPERADMIN)
    expect(crumb.sectionKey).toBe('sections.customers')
    expect(crumb.sectionHref).toBe('/admin/orgs')
    expect(crumb.pageKey).toBe('revenue')
  })

  it('falls back to the parent for a detail page rather than showing a uuid', () => {
    const crumb = resolveAdminBreadcrumb('/admin/orgs/abc-123', SUPERADMIN)
    expect(crumb.pageKey).toBe('orgs')
    expect(crumb.sectionKey).toBe('sections.customers')
  })

  it('returns a null page key rather than guessing for an unknown route', () => {
    expect(resolveAdminBreadcrumb('/admin/nope', SUPERADMIN).pageKey).toBeNull()
  })
})

describe('matchAdminPages', () => {
  const title = (e: AdminNavEntry) => ({ orgs: 'ארגונים', revenue: 'הכנסות' })[e.navKey] ?? e.navKey

  it('ignores a query shorter than two characters', () => {
    expect(matchAdminPages('a', ADMIN_NAV, title)).toEqual([])
  })

  it('finds a page by its Hebrew title', () => {
    expect(matchAdminPages('ארגונ', ADMIN_NAV, title).map((e) => e.href)).toContain('/admin/orgs')
  })

  it('finds the same page typed in English inside a Hebrew UI', () => {
    expect(matchAdminPages('tenants', ADMIN_NAV, title).map((e) => e.href)).toContain(
      '/admin/orgs'
    )
  })

  it('ranks a title match above a synonym-only match', () => {
    // "הכנסות" is the revenue page's own name; the subscriptions entry only
    // carries "churn"/"plans" as synonyms.
    const hits = matchAdminPages('הכנסות', ADMIN_NAV, title)
    expect(hits[0]?.href).toBe('/admin/revenue')
  })

  it('is case-insensitive', () => {
    expect(matchAdminPages('TENANTS', ADMIN_NAV, title).map((e) => e.href)).toContain(
      '/admin/orgs'
    )
  })
})
