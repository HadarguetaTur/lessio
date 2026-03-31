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
    <nav className="fixed bottom-0 right-0 left-0 max-w-[480px] mx-auto border-t border-gray-200 bg-white flex">
      {TABS.map(({ id, label, href, icon: Icon }) => (
        <Link
          key={id}
          href={href(orgId)}
          className={`flex-1 flex flex-col items-center py-3 text-xs gap-1 transition-colors ${
            active === id ? 'text-blue-600' : 'text-gray-500'
          }`}
        >
          <Icon size={20} />
          {label}
        </Link>
      ))}
    </nav>
  )
}
