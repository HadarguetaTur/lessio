'use client'

import Link from 'next/link'
import { Home, CalendarPlus, Receipt } from 'lucide-react'

const TABS = [
  { id: 'home',     label: 'בית',     href: (orgId: string) => `/portal/${orgId}/home`,     icon: Home },
  { id: 'book',     label: 'קביעה',   href: (orgId: string) => `/portal/${orgId}/book`,     icon: CalendarPlus },
  { id: 'payments', label: 'תשלומים', href: (orgId: string) => `/portal/${orgId}/payments`, icon: Receipt },
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
