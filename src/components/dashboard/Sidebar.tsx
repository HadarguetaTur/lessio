'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  GraduationCap,
  Users,
  UserRound,
  BookOpen,
  Receipt,
  Settings,
  LogOut,
  UserPlus,
  CalendarDays,
} from 'lucide-react'
import { signOut } from '@/lib/auth/actions'

const NAV_ITEMS: { href: string; label: string; icon: React.ElementType; roles?: string[] }[] = [
  { href: '/dashboard', label: 'לוח הבקרה', icon: LayoutDashboard, roles: ['owner', 'admin'] },
  { href: '/students', label: 'תלמידים', icon: GraduationCap, roles: ['owner', 'admin'] },
  { href: '/parents', label: 'הורים', icon: Users, roles: ['owner', 'admin'] },
  { href: '/teachers', label: 'מורים', icon: UserRound, roles: ['owner', 'admin'] },
  { href: '/lessons', label: 'שיעורים', icon: BookOpen, roles: ['owner', 'admin'] },
  { href: '/charges', label: 'חיובים', icon: Receipt, roles: ['owner', 'admin'] },
  { href: '/leads', label: 'לידים', icon: UserPlus, roles: ['owner', 'admin'] },
  { href: '/settings/cancellation-policy', label: 'מדיניות ביטולים', icon: Settings, roles: ['owner'] },
  { href: '/teacher/schedule', label: 'השיעורים שלי', icon: CalendarDays, roles: ['teacher'] },
]

interface SidebarProps {
  userName: string
  userRole: string
}

export function Sidebar({ userName, userRole }: SidebarProps) {
  const pathname = usePathname()

  const roleLabel: Record<string, string> = {
    owner: 'בעלים',
    admin: 'מנהל',
    teacher: 'מורה',
  }

  return (
    <aside className="w-60 min-h-screen bg-white border-l border-gray-200 flex flex-col shrink-0">
      {/* Logo */}
      <div className="h-16 flex items-center px-5 border-b border-gray-200">
        <span className="text-xl font-bold text-gray-900 tracking-tight">LESSIO</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5">
        {NAV_ITEMS.filter(({ roles }) => !roles || roles.includes(userRole)).map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                active
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              <Icon size={17} />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* User + Logout */}
      <div className="p-4 border-t border-gray-200">
        <div className="mb-1 text-sm font-medium text-gray-800 truncate">{userName}</div>
        <div className="mb-3 text-xs text-gray-400">{roleLabel[userRole] ?? userRole}</div>
        <form action={signOut}>
          <button
            type="submit"
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 w-full px-2 py-1.5 rounded-md hover:bg-gray-100 transition-colors"
          >
            <LogOut size={15} />
            יציאה
          </button>
        </form>
      </div>
    </aside>
  )
}
