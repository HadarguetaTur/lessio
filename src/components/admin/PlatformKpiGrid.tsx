import { getTranslations } from 'next-intl/server'
import type { PlatformStats } from '@/lib/superadmin/dashboard'

interface Props {
  stats: PlatformStats
}

export async function PlatformKpiGrid({ stats }: Props) {
  const t = await getTranslations('admin')
  const cards = [
    { label: t('dashboard.kpi.totalOrgs'),       value: stats.totalOrganizations.toLocaleString('he-IL'),            sub: null },
    { label: t('dashboard.kpi.activeOrgs'),       value: stats.activeOrganizationsLast30Days.toLocaleString('he-IL'), sub: null },
    { label: t('dashboard.kpi.lessonsThisMonth'), value: stats.platformLessonsThisMonth.toLocaleString('he-IL'),       sub: null },
    { label: t('dashboard.kpi.revenueThisMonth'), value: `₪${stats.platformRevenueThisMonth.toLocaleString('he-IL')}`, sub: t('dashboard.kpi.paymentsReceived') },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {cards.map((c) => (
        <div key={c.label} className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{c.label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">{c.value}</p>
          {c.sub && <p className="text-xs text-muted-foreground mt-0.5">{c.sub}</p>}
        </div>
      ))}
    </div>
  )
}
