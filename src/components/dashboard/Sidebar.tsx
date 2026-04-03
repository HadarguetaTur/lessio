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
  ClipboardList,
  Receipt,
  Settings,
  LogOut,
  UserPlus,
  CalendarDays,
  MessageCircle,
  MessageSquare,
  CreditCard,
  Clock,
  CalendarX,
  CalendarOff,
  Bell,
  Plus,
  FileText,
} from 'lucide-react'
import { signOut } from '@/lib/auth/actions'

interface NavItem {
  href: string
  label: string
  icon: React.ElementType
  roles?: string[]
}

interface NavSection {
  id: string
  label: string | null
  items: NavItem[]
}

const NAV_SECTIONS: NavSection[] = [
  {
    id: 'ops',
    label: 'ניהול',
    items: [
      { href: '/dashboard',  label: 'לוח הבקרה', icon: LayoutDashboard, roles: ['owner', 'admin'] },
      { href: '/students',   label: 'תלמידים',    icon: GraduationCap,   roles: ['owner', 'admin'] },
      { href: '/parents',    label: 'הורים',       icon: Users,           roles: ['owner', 'admin'] },
      { href: '/teachers',   label: 'מורים',       icon: UserRound,       roles: ['owner', 'admin'] },
      { href: '/lessons',    label: 'שיעורים',     icon: BookOpen,        roles: ['owner', 'admin'] },
      { href: '/charges',    label: 'חיובים',      icon: Receipt,         roles: ['owner', 'admin'] },
      { href: '/leads',      label: 'לידים',       icon: UserPlus,        roles: ['owner', 'admin'] },
      { href: '/homework',   label: 'שיעורי בית',  icon: ClipboardList,   roles: ['owner', 'admin', 'teacher'] },
    ],
  },
  {
    id: 'settings',
    label: 'הגדרות',
    items: [
      { href: '/settings/whatsapp',              label: 'WhatsApp',         icon: MessageCircle,  roles: ['owner'] },
      { href: '/settings/message-templates',   label: 'הודעות',           icon: MessageSquare,  roles: ['owner'] },
      { href: '/settings/payment',             label: 'תשלומים',          icon: CreditCard,     roles: ['owner'] },
      { href: '/settings/receipts',            label: 'קבלות',            icon: FileText,       roles: ['owner'] },
      { href: '/settings/cancellation-policy', label: 'מדיניות ביטולים', icon: Settings,       roles: ['owner'] },
      { href: '/settings/holidays',            label: 'חגים וחופשות',    icon: CalendarOff,    roles: ['owner', 'admin'] },
      { href: '/settings/reminders',           label: 'תזכורות',          icon: Bell,           roles: ['owner'] },
    ],
  },
  {
    id: 'teacher',
    label: null,
    items: [
      { href: '/teacher/schedule',     label: 'השיעורים שלי', icon: CalendarDays,  roles: ['teacher'] },
      { href: '/teacher/calendar',     label: 'מנוי ליומן',   icon: CalendarDays,  roles: ['teacher'] },
      { href: '/teacher/new-lesson',   label: 'שיעור חדש',    icon: Plus,          roles: ['teacher'] },
      { href: '/teacher/availability', label: 'הזמינות שלי',  icon: Clock,         roles: ['teacher'] },
      { href: '/teacher/overrides',    label: 'חריגים ביומן', icon: CalendarX,     roles: ['teacher'] },
    ],
  },
]

interface SidebarProps {
  userName: string
  userRole: string
}

export function Sidebar({ userName, userRole }: SidebarProps) {
  const pathname = usePathname()

  const roleLabel: Record<string, string> = {
    owner:   'בעלים',
    admin:   'מנהל',
    teacher: 'מורה',
  }

  const initials = userName
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()

  return (
    <aside className="w-60 min-h-screen bg-white border-l border-gray-100 flex flex-col shrink-0">
      {/* Logo */}
      <div className="h-16 flex items-center px-5 border-b border-gray-100">
        <span className="text-xl font-bold text-gray-900 tracking-tight">LESSIO</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-5">
        {NAV_SECTIONS.map((section, sectionIdx) => {
          const visibleItems = section.items.filter(
            ({ roles }) => !roles || roles.includes(userRole)
          )
          if (visibleItems.length === 0) return null

          return (
            <div key={section.id}>
              {section.label && (
                <p className="px-3 pb-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  {section.label}
                </p>
              )}
              <div className="space-y-1">
                {visibleItems.map(({ href, label, icon: Icon }) => {
                  const active = pathname === href || pathname.startsWith(href + '/')
                  return (
                    <Link
                      key={href}
                      href={href}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                        active
                          ? 'bg-blue-50 text-blue-700 font-semibold'
                          : 'text-gray-500 font-medium hover:bg-gray-50 hover:text-gray-800'
                      }`}
                    >
                      <Icon size={16} className={active ? 'text-blue-600' : 'text-gray-400'} />
                      {label}
                    </Link>
                  )
                })}
              </div>
            </div>
          )
        })}
      </nav>

      {/* User + Logout */}
      <div className="p-4 border-t border-gray-100">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold shrink-0">
            {initials || '?'}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-800 truncate leading-tight">{userName}</p>
            <p className="text-xs text-gray-400 leading-tight">{roleLabel[userRole] ?? userRole}</p>
          </div>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-700 w-full px-2 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <LogOut size={13} />
            יציאה
          </button>
        </form>
      </div>
    </aside>
  )
}
