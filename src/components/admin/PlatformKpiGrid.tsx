import type { PlatformStats } from '@/lib/superadmin/dashboard'

interface Props {
  stats: PlatformStats
}

export function PlatformKpiGrid({ stats }: Props) {
  const cards = [
    { label: 'ארגונים סה״כ',         value: stats.totalOrganizations.toLocaleString('he-IL'),           sub: null },
    { label: 'פעילים (30 יום)',        value: stats.activeOrganizationsLast30Days.toLocaleString('he-IL'), sub: null },
    { label: 'שיעורים החודש',          value: stats.platformLessonsThisMonth.toLocaleString('he-IL'),      sub: null },
    { label: 'הכנסות החודש',           value: `₪${stats.platformRevenueThisMonth.toLocaleString('he-IL')}`, sub: 'תשלומים שהתקבלו' },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {cards.map((c) => (
        <div key={c.label} className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{c.label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">{c.value}</p>
          {c.sub && <p className="text-xs text-gray-400 mt-0.5">{c.sub}</p>}
        </div>
      ))}
    </div>
  )
}
