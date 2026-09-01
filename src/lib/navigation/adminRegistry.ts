/**
 * The platform console's navigation, in one place.
 *
 * Per /docs/sprint-34-scope.md § A. Mirrors ./registry.ts deliberately: same
 * entry shape, same "category is a view over entries" trick, same resolvers —
 * so the admin shell can reuse the dashboard's two-level language (flat
 * sidebar rows + a tab strip of siblings) rather than inventing a third one.
 *
 * Isomorphic on purpose: imported by the server layout and by the client
 * sidebar, tab strip and command palette. Entries carry translation *keys*,
 * never strings.
 *
 * The M1 sidebar nested its sub-menus inside itself and rendered pages that
 * did not exist yet as live links with a "soon" tag — six of them answered
 * 404. Here an unbuilt page simply has no entry, so it cannot be linked, and
 * adminRegistry.test.ts asserts every href resolves to a real route file.
 */

import {
  Activity,
  Bug,
  Building2,
  Coins,
  CreditCard,
  LayoutDashboard,
  LifeBuoy,
  Megaphone,
  ScrollText,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  type LucideIcon,
} from 'lucide-react'

import type { PlatformCapability } from '@/lib/superadmin/capabilities'

export interface AdminNavEntry {
  href: string
  /** Key under the `admin.nav` namespace. The t() call stays with the consumer. */
  navKey: string
  icon: LucideIcon
  /** Absent = visible to anyone with a platform role. */
  capability?: PlatformCapability
  /** Lowercase search aliases for the command palette. Latin only — the
   *  Hebrew label is already matched through the translated title. */
  synonyms?: string[]
}

/** The standalone row above the categories, like /dashboard in the tenant shell. */
export const ADMIN_OVERVIEW: AdminNavEntry = {
  href: '/admin',
  navKey: 'overview',
  icon: LayoutDashboard,
  synonyms: ['overview', 'dashboard', 'home', 'mrr', 'start'],
}

/**
 * Every page in the console.
 *
 * Growth (leads, campaigns, attribution, tracking) and the operations feeds
 * (errors, cost) are absent until their routes exist — see § C and § D of the
 * scope. Adding the page and adding the entry is one change, which is what
 * keeps the nav honest.
 */
export const ADMIN_NAV: AdminNavEntry[] = [
  {
    href: '/admin/tracking',
    navKey: 'tracking',
    icon: Activity,
    capability: 'growth.read',
    synonyms: ['tracking', 'pixel', 'meta', 'facebook', 'ga4', 'analytics', 'conversions', 'capi'],
  },
  {
    href: '/admin/orgs',
    navKey: 'orgs',
    icon: Building2,
    capability: 'orgs.read',
    synonyms: ['organizations', 'orgs', 'tenants', 'accounts', 'customers'],
  },
  {
    href: '/admin/subscriptions',
    navKey: 'subscriptions',
    icon: CreditCard,
    capability: 'billing.read',
    synonyms: ['subscriptions', 'plans', 'trials', 'past due', 'churn'],
  },
  {
    href: '/admin/revenue',
    navKey: 'revenue',
    icon: Coins,
    capability: 'billing.read',
    synonyms: ['revenue', 'invoices', 'mrr', 'sumit', 'money', 'income'],
  },
  {
    href: '/admin/support',
    navKey: 'support',
    icon: LifeBuoy,
    capability: 'support.read',
    synonyms: ['support', 'tickets', 'help', 'inbox'],
  },
  {
    href: '/admin/dev-issues',
    navKey: 'devIssues',
    icon: Bug,
    capability: 'support.read',
    synonyms: ['bugs', 'issues', 'dev', 'recurring', 'incidents'],
  },
  {
    href: '/admin/plans',
    navKey: 'plans',
    icon: SlidersHorizontal,
    capability: 'billing.read',
    synonyms: ['plans', 'pricing', 'quotas', 'features', 'tiers'],
  },
  {
    href: '/admin/staff',
    navKey: 'staff',
    icon: ShieldCheck,
    capability: 'staff.manage',
    synonyms: ['staff', 'team', 'users', 'people', 'roles', 'permissions', 'invite'],
  },
  {
    href: '/admin/audit',
    navKey: 'audit',
    icon: ScrollText,
    capability: 'audit.read',
    synonyms: ['audit', 'log', 'history', 'trail', 'who did'],
  },
]

const ROUTE_BY_HREF = new Map(
  [ADMIN_OVERVIEW, ...ADMIN_NAV].map((entry) => [entry.href, entry])
)

function entryOf(href: string): AdminNavEntry {
  const entry = ROUTE_BY_HREF.get(href)
  if (!entry) throw new Error(`[adminRegistry] category references unknown route: ${href}`)
  return entry
}

export type AdminCategoryId = 'growth' | 'customers' | 'operations' | 'platform'

export interface AdminCategory {
  id: AdminCategoryId
  /** Key under `admin.nav.sections` — sidebar label, strip aria-label, breadcrumb. */
  sectionKey: string
  icon: LucideIcon
  items: AdminNavEntry[]
}

/**
 * The sidebar's categories, and the tab strip inside each.
 *
 * Items are references by href, so a capability is declared once on the entry
 * and every surface inherits it. There is no `landing` field: the row lands on
 * the first item the operator can actually see, so a support agent clicking
 * "לקוחות" reaches /admin/orgs while a billing colleague reaching the same row
 * never lands on a page their role cannot open.
 */
export const ADMIN_CATEGORIES: AdminCategory[] = [
  {
    id: 'growth',
    sectionKey: 'sections.growth',
    icon: Megaphone,
    // Leads, campaigns and attribution join in § D.
    items: ['/admin/tracking'].map(entryOf),
  },
  {
    id: 'customers',
    sectionKey: 'sections.customers',
    icon: Users,
    items: ['/admin/orgs', '/admin/subscriptions', '/admin/revenue'].map(entryOf),
  },
  {
    id: 'operations',
    sectionKey: 'sections.operations',
    icon: LifeBuoy,
    items: ['/admin/support', '/admin/dev-issues'].map(entryOf),
  },
  {
    id: 'platform',
    sectionKey: 'sections.platform',
    icon: SlidersHorizontal,
    items: ['/admin/plans', '/admin/staff', '/admin/audit'].map(entryOf),
  },
]

/** The capability analogue of `filterNav`. */
export function filterAdminNav(
  entries: AdminNavEntry[],
  capabilities: readonly PlatformCapability[]
): AdminNavEntry[] {
  return entries.filter(
    (entry) => !entry.capability || capabilities.includes(entry.capability)
  )
}

/** Where a sidebar row should land for this operator, or null when it has nothing to show. */
export function landingFor(
  category: AdminCategory,
  capabilities: readonly PlatformCapability[]
): string | null {
  return filterAdminNav(category.items, capabilities)[0]?.href ?? null
}

/**
 * Which category a pathname belongs to. Exact item match wins; otherwise the
 * longest item prefix, so /admin/orgs/<id> resolves to customers. Null for
 * /admin itself and anything unknown.
 */
export function adminCategoryFor(pathname: string): AdminCategory | null {
  let best: { category: AdminCategory; length: number } | null = null
  for (const category of ADMIN_CATEGORIES) {
    for (const item of category.items) {
      if (pathname === item.href) return category
      if (pathname.startsWith(item.href + '/') && (!best || item.href.length > best.length)) {
        best = { category, length: item.href.length }
      }
    }
  }
  return best?.category ?? null
}

export interface AdminBreadcrumb {
  sectionKey: string | null
  sectionHref: string | null
  pageKey: string | null
}

/**
 * Breadcrumb for an admin route.
 *
 * A detail page falls back to its parent's key, so /admin/orgs/<id> reads
 * "לקוחות ‹ ארגונים" rather than showing a raw uuid. The section is dropped on
 * a category's own first page — "לקוחות ‹ ארגונים" is worth saying, but
 * repeating the section as the page would not be.
 */
export function resolveAdminBreadcrumb(
  pathname: string,
  capabilities: readonly PlatformCapability[] = []
): AdminBreadcrumb {
  if (pathname === ADMIN_OVERVIEW.href) {
    return { sectionKey: null, sectionHref: null, pageKey: ADMIN_OVERVIEW.navKey }
  }

  const category = adminCategoryFor(pathname)
  const sectionHref = category ? landingFor(category, capabilities) : null

  const exact = ROUTE_BY_HREF.get(pathname)
  if (exact) {
    return {
      sectionKey: category ? category.sectionKey : null,
      sectionHref: sectionHref === pathname ? null : sectionHref,
      pageKey: exact.navKey,
    }
  }

  // Walk up to the nearest real page. The overview is excluded: it is the
  // shell root, not a parent section, so /admin/nope must resolve to nothing
  // rather than inheriting the overview's label.
  const parentOf = (depth: number): string | null => {
    const candidate = pathname.split('/').slice(0, -depth).join('/')
    if (candidate === ADMIN_OVERVIEW.href) return null
    return ROUTE_BY_HREF.get(candidate)?.navKey ?? null
  }
  const pageKey = parentOf(1) ?? parentOf(2)

  return {
    sectionKey: category?.sectionKey ?? null,
    sectionHref,
    pageKey,
  }
}

/**
 * Substring match over the translated title plus synonyms. `getTitle` is
 * injected so this stays pure — testable without standing up next-intl.
 * A title match outranks a synonym-only match.
 */
export function matchAdminPages(
  query: string,
  entries: AdminNavEntry[],
  getTitle: (entry: AdminNavEntry) => string,
  limit = 6
): AdminNavEntry[] {
  const q = query.trim().toLowerCase()
  if (q.length < 2) return []

  const byTitle: AdminNavEntry[] = []
  const bySynonym: AdminNavEntry[] = []
  for (const entry of entries) {
    if (getTitle(entry).toLowerCase().includes(q)) byTitle.push(entry)
    else if (entry.synonyms?.some((s) => s.includes(q))) bySynonym.push(entry)
  }
  return [...byTitle, ...bySynonym].slice(0, limit)
}
