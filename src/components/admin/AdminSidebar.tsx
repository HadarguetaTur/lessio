'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  LayoutDashboard,
  Building2,
  CreditCard,
  LogOut,
  ShieldCheck,
} from 'lucide-react'
import { signOut } from '@/lib/auth/actions'
import { cn } from '@/lib/utils'

interface AdminSidebarProps {
  userName: string
  mobile?: boolean
}

export function AdminSidebar({ userName, mobile = false }: AdminSidebarProps) {
  const pathname = usePathname()
  const t = useTranslations('admin')
  const tCommon = useTranslations('common')

  const NAV_ITEMS = [
    { href: '/admin/dashboard', label: t('nav.dashboard'), icon: LayoutDashboard },
    { href: '/admin/orgs',      label: t('nav.orgs'),      icon: Building2       },
    { href: '/admin/billing',   label: t('nav.billing'),   icon: CreditCard      },
  ]

  const initials = userName
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()

  return (
    <aside
      className={cn(
        'bg-gray-900 text-gray-100 flex flex-col shrink-0',
        mobile ? 'h-full w-full' : 'hidden lg:flex w-56 min-h-screen'
      )}
    >
      {/* Logo */}
      <div className="h-16 flex items-center gap-2 px-5 border-b border-gray-800">
        <ShieldCheck size={18} className="text-indigo-400" />
        <span className="text-sm font-bold tracking-tight">{t('nav.title')}</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                active
                  ? 'bg-indigo-600 text-white font-semibold'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-gray-100'
              }`}
            >
              <Icon size={16} />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* User + Logout */}
      <div className="p-4 border-t border-gray-800">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-indigo-700 text-indigo-200 flex items-center justify-center text-xs font-bold shrink-0">
            {initials || '?'}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-200 truncate leading-tight">{userName}</p>
            <p className="text-xs text-indigo-400 leading-tight">Super Admin</p>
          </div>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-300 w-full px-2 py-1.5 rounded-lg hover:bg-gray-800 transition-colors"
          >
            <LogOut size={13} />
            {tCommon('logout')}
          </button>
        </form>
      </div>
    </aside>
  )
}
