import Link from 'next/link'

import { cn } from '@/lib/utils'

/**
 * URL-driven tabs for admin detail pages.
 *
 * Per /docs/sprint-34-scope.md § /admin/orgs/[id]. A server component on
 * purpose: each tab is a real URL, so it survives a refresh, can be linked to
 * from the attention queue, and loads only its own data. Client-side tab state
 * would force every panel to be fetched on every visit.
 */
export function AdminTabs({
  basePath,
  param = 'tab',
  current,
  tabs,
}: {
  basePath: string
  param?: string
  current: string
  tabs: { key: string; label: string; count?: number }[]
}) {
  return (
    <nav
      className="mb-5 flex gap-1 overflow-x-auto border-b border-border"
      aria-label="Sections"
    >
      {tabs.map((tab) => {
        const active = tab.key === current
        // The first tab is the canonical URL, so it drops the query param
        // rather than pinning ?tab=overview onto every link to the page.
        const href =
          tab.key === tabs[0].key ? basePath : `${basePath}?${param}=${tab.key}`

        return (
          <Link
            key={tab.key}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              '-mb-px shrink-0 border-b-2 px-3 py-2 text-sm transition-colors',
              active
                ? 'border-indigo-600 font-semibold text-foreground'
                : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
            )}
          >
            {tab.label}
            {tab.count != null && tab.count > 0 && (
              <span className="ms-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums">
                {tab.count}
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}
