import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/auth/session'
import { getTranslations } from 'next-intl/server'
import { REPORTS_NAV, filterNav } from '@/lib/navigation/registry'

/**
 * Reports landing page — owner/admin only.
 * Cards come from the shared nav registry (src/lib/navigation/registry.ts);
 * teacher-performance existed in the sidebar but was missing from this index.
 */

export default async function ReportsPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!['owner', 'admin'].includes(session.role)) redirect('/dashboard')

  const t = await getTranslations('reports')

  const cards = filterNav(REPORTS_NAV, session.role).filter((entry) => entry.cardKey)

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">{t('title')}</h1>
      <p className="text-muted-foreground text-sm mb-8">{t('description')}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {cards.map(({ href, cardKey, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-start gap-4 p-5 rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-sm transition-all bg-white group"
          >
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0 group-hover:bg-blue-100 transition-colors">
              <Icon size={20} className="text-blue-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-900 text-sm">
                {t(`${cardKey}.title` as Parameters<typeof t>[0])}
              </p>
              <p className="text-muted-foreground text-xs mt-0.5">
                {t(`${cardKey}.description` as Parameters<typeof t>[0])}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
