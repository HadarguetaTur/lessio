import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { Home, CalendarDays, FileText, ClipboardList, TrendingUp, MessageCircle } from 'lucide-react'
import { getPortalSettings, type PortalFeature } from '@/lib/organizations/portalSettings'

/**
 * `feature` names the org toggle that hides the tab. Home and schedule have
 * none: they are the portal, and the master switch is how an org closes it.
 */
const TABS: ReadonlyArray<{
  id: string
  href: (orgId: string) => string
  icon: typeof Home
  feature?: PortalFeature
}> = [
  { id: 'home',     href: (orgId) => `/portal/${orgId}/home`,     icon: Home },
  { id: 'schedule', href: (orgId) => `/portal/${orgId}/schedule`, icon: CalendarDays },
  { id: 'homework', href: (orgId) => `/portal/${orgId}/homework`, icon: FileText,      feature: 'homework' },
  { id: 'exams',    href: (orgId) => `/portal/${orgId}/exams`,    icon: ClipboardList, feature: 'exams' },
  { id: 'progress', href: (orgId) => `/portal/${orgId}/progress`, icon: TrendingUp,    feature: 'progress' },
  { id: 'messages', href: (orgId) => `/portal/${orgId}/messages`, icon: MessageCircle, feature: 'messages' },
]

/**
 * Fixed bottom tab bar. A server component so it can read the org's portal
 * toggles itself — every page renders it, and threading the settings through
 * eleven pages just to reach this list is the kind of prop that gets forgotten
 * on the twelfth. `getPortalSettings` is request-cached, so this costs no
 * extra query on a page that already loaded them.
 */
export async function PortalTabBar({ orgId, active }: { orgId: string; active: string }) {
  const [t, settings] = await Promise.all([
    getTranslations('portal.nav'),
    getPortalSettings(orgId),
  ])
  const tabs = TABS.filter((tab) => !tab.feature || settings[tab.feature])

  return (
    <nav className="fixed bottom-0 right-0 left-0 z-40 max-w-[480px] mx-auto border-t border-border bg-card flex safe-bottom">
      {tabs.map(({ id, href, icon: Icon }) => {
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
              {t(id)}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
