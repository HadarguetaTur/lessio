'use client'

/**
 * The tab strip under the top bar: every page of a section shows its siblings,
 * so "where else can I go from here" never means opening the sidebar.
 *
 * Per /docs/sprint-34-scope.md § A — a port of
 * src/components/dashboard/SectionTabs.tsx, including its rules for when the
 * strip should not exist at all. These are navigation links, not ARIA tabs:
 * they change the URL, so the right semantics are a <nav> with
 * aria-current="page", not role="tablist".
 *
 * Three cases render nothing:
 *  - the pathname belongs to no section (the overview),
 *  - fewer than two items survive the capability filter — a strip with one tab
 *    is noise,
 *  - the pathname is not exactly one of the items, so a detail page like
 *    /admin/orgs/<id> gets a breadcrumb rather than a strip with no active tab.
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'

import { adminCategoryFor, filterAdminNav } from '@/lib/navigation/adminRegistry'
import type { PlatformCapability } from '@/lib/superadmin/capabilities'
import { cn } from '@/lib/utils'

interface AdminSectionTabsProps {
  capabilities: readonly PlatformCapability[]
}

export function AdminSectionTabs({ capabilities }: AdminSectionTabsProps) {
  const pathname = usePathname()
  const t = useTranslations('admin.nav')

  const category = adminCategoryFor(pathname)
  if (!category) return null

  const items = filterAdminNav(category.items, capabilities)
  if (items.length < 2) return null
  if (!items.some((item) => item.href === pathname)) return null

  return (
    <div className="shrink-0 border-b border-border bg-background">
      <nav
        aria-label={t(category.sectionKey)}
        className="mx-auto w-full max-w-[1440px] px-4 sm:px-6 lg:px-8"
      >
        <div className="flex gap-1 overflow-x-auto">
          {items.map(({ href, navKey, icon: Icon }) => {
            const active = href === pathname
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
                  active
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon size={15} aria-hidden />
                {t(navKey)}
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
