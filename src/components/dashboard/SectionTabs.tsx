'use client'

/**
 * The tab strip under the top bar: every page of a category shows its
 * siblings as plain links, so "where else can I go from here" never requires
 * opening the sidebar.
 *
 * These are navigation links, not ARIA tabs — they change the URL, so the
 * right semantics are a <nav> with aria-current="page", not role="tablist".
 *
 * Rendering rules (each one returns null):
 *  - teacher role: the teacher sub-shell keeps its own flat nav.
 *  - pathname is not EXACTLY one of the category's items: detail pages
 *    (/students/<id>, /lessons/import) get breadcrumbs, not a strip with no
 *    active tab.
 *  - fewer than two visible items after role/plan gating: a strip with one
 *    tab is noise.
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { categoryFor, filterNav } from '@/lib/navigation/registry'
import type { SaasFeatures } from '@/lib/saas/types'
import { cn } from '@/lib/utils'

interface SectionTabsProps {
  userRole: string
  saasFeatures?: SaasFeatures
  /** `<= 1` hides the teachers category, mirroring the sidebar's solo-teacher rule. */
  teacherCount?: number
}

export function SectionTabs({ userRole, saasFeatures, teacherCount }: SectionTabsProps) {
  const pathname = usePathname()
  const t = useTranslations('nav')

  if (userRole === 'teacher') return null

  const category = categoryFor(pathname)
  if (!category) return null
  if (category.id === 'teachers' && teacherCount !== undefined && teacherCount <= 1) return null

  const items = filterNav(category.items, userRole, saasFeatures)
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
