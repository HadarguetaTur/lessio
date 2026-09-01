'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { LogOut, Search, ShieldCheck } from 'lucide-react'

import { signOut } from '@/lib/auth/actions'
import {
  ADMIN_CATEGORIES,
  ADMIN_OVERVIEW,
  adminCategoryFor,
  landingFor,
} from '@/lib/navigation/adminRegistry'
import type { PlatformCapability, PlatformRole } from '@/lib/superadmin/capabilities'
import { cn } from '@/lib/utils'

/**
 * The console's sidebar: one row per section, no nesting.
 *
 * Per /docs/sprint-34-scope.md § A. The tenant shell settled this shape
 * already — see the note in src/components/dashboard/Sidebar.tsx: the category
 * row lands on its main page, and from there AdminSectionTabs shows the
 * siblings, so the sidebar never needs sub-items.
 *
 * The M1 version did the opposite (four labelled groups nested inside itself)
 * and painted `bg-zinc-900` while labelling rows with `--muted-foreground`, a
 * light-theme token that is near-invisible on that ground. Both are fixed here
 * by using the `--sidebar` family the tenant shell already defines.
 */

/** Counts rendered as badges. Zero renders nothing — a badge reading "0" is
 *  noise competing with the ones that mean something. */
export type AdminNavCounts = {
  pastDue?: number
  support?: number
  devIssues?: number
  leads?: number
}

interface AdminSidebarProps {
  userName: string
  role: PlatformRole
  capabilities: readonly PlatformCapability[]
  counts?: AdminNavCounts
  mobile?: boolean
  onNavigate?: () => void
}

/** The active-row marker, matching the tenant sidebar. */
function Rail() {
  return (
    <span
      aria-hidden
      className="absolute end-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-sidebar-primary"
    />
  )
}

/** Which badge belongs on which row, once a category collapses to one row. */
function countForCategory(id: string, counts?: AdminNavCounts): number | undefined {
  if (!counts) return undefined
  if (id === 'operations') return (counts.support ?? 0) + (counts.devIssues ?? 0)
  if (id === 'customers') return counts.pastDue
  if (id === 'growth') return counts.leads
  return undefined
}

export function AdminSidebar({
  userName,
  role,
  capabilities,
  counts,
  mobile = false,
  onNavigate,
}: AdminSidebarProps) {
  const pathname = usePathname()
  const t = useTranslations('admin.nav')
  const tCommon = useTranslations('common')

  const activeCategory = adminCategoryFor(pathname)

  const rows = ADMIN_CATEGORIES.map((category) => ({
    category,
    href: landingFor(category, capabilities),
  })).filter((row): row is { category: (typeof ADMIN_CATEGORIES)[number]; href: string } =>
    row.href !== null
  )

  const initials = userName
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()

  const linkClass = (active: boolean) =>
    cn(
      'group relative flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] transition-all duration-150 max-lg:min-h-11',
      active
        ? 'bg-sidebar-accent font-medium text-sidebar-primary'
        : 'font-normal text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'
    )

  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col bg-sidebar',
        mobile
          ? 'h-full w-full border-e border-sidebar-border'
          : 'hidden h-full min-h-0 w-60 border-e border-sidebar-border lg:flex'
      )}
    >
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-sidebar-border px-5">
        <ShieldCheck size={16} className="text-sidebar-primary" />
        <span className="text-sm font-bold tracking-tight text-sidebar-foreground">
          {t('title')}
        </span>
      </div>

      <button
        type="button"
        onClick={() => document.dispatchEvent(new CustomEvent('admin:open-command-palette'))}
        className="mx-3 mt-3 flex items-center gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/40 px-3 py-2 text-xs text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground max-lg:min-h-11"
      >
        <Search size={14} />
        <span className="truncate">{t('searchPlaceholder')}</span>
        <kbd className="ms-auto rounded border border-sidebar-border px-1.5 py-0.5 font-mono text-[10px]">
          ⌘K
        </kbd>
      </button>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
        <Link
          href={ADMIN_OVERVIEW.href}
          onClick={onNavigate}
          aria-current={pathname === ADMIN_OVERVIEW.href ? 'page' : undefined}
          className={linkClass(pathname === ADMIN_OVERVIEW.href)}
        >
          <ADMIN_OVERVIEW.icon size={14} className="shrink-0" />
          <span className="truncate">{t(ADMIN_OVERVIEW.navKey)}</span>
          {pathname === ADMIN_OVERVIEW.href && <Rail />}
        </Link>

        {rows.map(({ category, href }) => {
          const active = activeCategory?.id === category.id
          const count = countForCategory(category.id, counts)

          return (
            <Link
              key={category.id}
              href={href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={linkClass(active)}
            >
              <category.icon size={14} className="shrink-0" />
              <span className="truncate">{t(category.sectionKey)}</span>
              {count != null && count > 0 && (
                <span className="ms-auto rounded-full bg-sidebar-accent px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-sidebar-foreground">
                  {count > 99 ? '99+' : count}
                </span>
              )}
              {active && <Rail />}
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-sidebar-border p-4">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-xs font-bold text-sidebar-primary">
            {initials || '?'}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium leading-tight text-sidebar-foreground">
              {userName}
            </p>
            <p className="truncate text-xs leading-tight text-sidebar-primary">
              {t(`roles.${role}`)}
            </p>
          </div>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground max-lg:min-h-11"
          >
            <LogOut size={13} />
            {tCommon('logout')}
          </button>
        </form>
      </div>
    </aside>
  )
}
