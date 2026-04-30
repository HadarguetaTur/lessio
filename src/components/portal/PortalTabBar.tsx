'use client'

import Link from 'next/link'
import { Home, CalendarDays, FileText, TrendingUp, MessageCircle } from 'lucide-react'

const TABS = [
  { id: 'home',     label: 'בית',       href: (orgId: string) => `/portal/${orgId}/home`,     icon: Home },
  { id: 'schedule', label: 'לוח',       href: (orgId: string) => `/portal/${orgId}/schedule`, icon: CalendarDays },
  { id: 'homework', label: 'משימות',    href: (orgId: string) => `/portal/${orgId}/homework`, icon: FileText },
  { id: 'progress', label: 'התקדמות',   href: (orgId: string) => `/portal/${orgId}/progress`, icon: TrendingUp },
  { id: 'messages', label: 'הודעות',    href: (orgId: string) => `/portal/${orgId}/messages`, icon: MessageCircle },
]

export function PortalTabBar({ orgId, active }: { orgId: string; active: string }) {
  return (
    <nav className="fixed bottom-0 right-0 left-0 max-w-[480px] mx-auto border-t border-border bg-card flex safe-bottom">
      {TABS.map(({ id, label, href, icon: Icon }) => {
        const isActive = active === id
        return (
          <Link
            key={id}
            href={href(orgId)}
            className={`flex-1 flex flex-col items-center py-3 text-xs gap-1 transition-colors ${
              isActive
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <div className={`p-1.5 rounded-lg transition-colors ${isActive ? 'bg-primary/10' : ''}`}>
              <Icon size={18} />
            </div>
            <span className={`leading-none ${isActive ? 'font-semibold' : 'font-normal'}`}>
              {label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
