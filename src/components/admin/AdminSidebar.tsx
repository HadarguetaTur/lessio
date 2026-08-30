'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  Activity,
  AlertTriangle,
  Bug,
  Building2,
  Coins,
  CreditCard,
  Gauge,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Megaphone,
  ScrollText,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  UserPlus,
} from 'lucide-react'

import { signOut } from '@/lib/auth/actions'
import { cn } from '@/lib/utils'

/** Counts rendered as badges. Zero and undefined both render nothing — a badge
 *  reading "0" is noise competing with the ones that mean something. */
export type AdminNavCounts = {
  leads?: number
  pastDue?: number
  support?: number
  devIssues?: number
}

interface AdminSidebarProps {
  userName: string
  counts?: AdminNavCounts
  mobile?: boolean
  onNavigate?: () => void
}

type NavItem = {
  href: string
  label: string
  icon: React.ComponentType<{ size?: number | string; className?: string }>
  count?: number
  /** Specced but not built yet. Shown so the shape of the console is legible. */
  soon?: boolean
}

export function AdminSidebar({
  userName,
  counts,
  mobile = false,
  onNavigate,
}: AdminSidebarProps) {
  const pathname = usePathname()
  const t = useTranslations('admin')
  const tCommon = useTranslations('common')

  const groups: { label: string | null; items: NavItem[] }[] = [
    {
      label: null,
      items: [{ href: '/admin', label: t('nav.overview'), icon: LayoutDashboard }],
    },
    {
      label: t('nav.groups.growth'),
      items: [
        {
          href: '/admin/leads',
          label: t('nav.leads'),
          icon: UserPlus,
          count: counts?.leads,
          soon: true,
        },
        { href: '/admin/campaigns', label: t('nav.campaigns'), icon: Megaphone, soon: true },
        { href: '/admin/attribution', label: t('nav.attribution'), icon: Target, soon: true },
        { href: '/admin/tracking', label: t('nav.tracking'), icon: Activity, soon: true },
      ],
    },
    {
      label: t('nav.groups.customers'),
      items: [
        { href: '/admin/orgs', label: t('nav.orgs'), icon: Building2 },
        {
          href: '/admin/subscriptions',
          label: t('nav.subscriptions'),
          icon: CreditCard,
          count: counts?.pastDue,
        },
        { href: '/admin/revenue', label: t('nav.revenue'), icon: Coins },
      ],
    },
    {
      label: t('nav.groups.operations'),
      items: [
        {
          href: '/admin/support',
          label: t('nav.support'),
          icon: LifeBuoy,
          count: counts?.support,
        },
        {
          href: '/admin/dev-issues',
          label: t('nav.devIssues'),
          icon: Bug,
          count: counts?.devIssues,
        },
        { href: '/admin/errors', label: t('nav.errors'), icon: AlertTriangle, soon: true },
        { href: '/admin/cost', label: t('nav.cost'), icon: Gauge, soon: true },
      ],
    },
    {
      label: t('nav.groups.platform'),
      items: [
        { href: '/admin/plans', label: t('nav.plans'), icon: SlidersHorizontal },
        { href: '/admin/audit', label: t('nav.audit'), icon: ScrollText },
      ],
    },
  ]

  const initials = userName
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()

  function isActive(href: string): boolean {
    // /admin is the index, so prefix matching would light it up on every page.
    if (href === '/admin') return pathname === '/admin'
    return pathname === href || pathname.startsWith(href + '/')
  }

  return (
    <aside
      className={cn(
        // Its own dark surface, declared here rather than borrowed: the previous
        // version painted bg-gray-900 and then labelled items with
        // --muted-foreground, a light-theme token — near-invisible on this ground.
        'flex shrink-0 flex-col bg-zinc-900 text-zinc-100',
        mobile ? 'h-full w-full' : 'hidden min-h-screen w-60 lg:flex'
      )}
    >
      <div className="flex h-16 items-center gap-2 border-b border-zinc-800 px-5">
        <ShieldCheck size={18} className="text-indigo-400" />
        <span className="text-sm font-bold tracking-tight">{t('nav.title')}</span>
      </div>

      <button
        type="button"
        onClick={() => document.dispatchEvent(new CustomEvent('admin:open-command-palette'))}
        className="mx-3 mt-3 flex items-center gap-2 rounded-lg border border-zinc-700/80 bg-zinc-800/60 px-3 py-2 text-xs text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-200"
      >
        <Search size={14} />
        <span className="truncate">{t('nav.searchPlaceholder')}</span>
        <kbd className="ms-auto rounded border border-zinc-700 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">
          ⌘K
        </kbd>
      </button>

      <nav className="flex-1 overflow-y-auto px-3 py-3">
        {groups.map((group, gi) => (
          <div key={group.label ?? `group-${gi}`} className={gi > 0 ? 'mt-5' : ''}>
            {group.label && (
              <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                {group.label}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map(({ href, label, icon: Icon, count, soon }) => {
                const active = isActive(href)
                const showCount = count != null && count > 0
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                      active
                        ? 'bg-indigo-600 font-semibold text-white'
                        : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'
                    )}
                  >
                    <Icon size={16} className="shrink-0" />
                    <span className="truncate">{label}</span>
                    {showCount && (
                      <span
                        className={cn(
                          'ms-auto rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums',
                          active ? 'bg-white/20 text-white' : 'bg-zinc-700 text-zinc-200'
                        )}
                      >
                        {count > 99 ? '99+' : count}
                      </span>
                    )}
                    {soon && !showCount && (
                      <span className="ms-auto text-[9px] uppercase tracking-wider text-zinc-600">
                        {t('nav.soon')}
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-zinc-800 p-4">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-700 text-xs font-bold text-indigo-100">
            {initials || '?'}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium leading-tight text-zinc-200">
              {userName}
            </p>
            <p className="text-xs leading-tight text-indigo-400">Super Admin</p>
          </div>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
          >
            <LogOut size={13} />
            {tCommon('logout')}
          </button>
        </form>
      </div>
    </aside>
  )
}
