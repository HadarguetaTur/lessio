import { getTranslations } from 'next-intl/server'

import type { PlatformActivity } from '@/lib/superadmin/dashboard'

/**
 * Tenant-side volume: how much the platform is being used, as distinct from
 * what it earns. Kept deliberately secondary to the SaaS row above it — these
 * numbers used to be the whole dashboard, which is how "revenue" ended up
 * meaning a teacher's income rather than Lessio's.
 */
export async function PlatformActivityRow({ activity }: { activity: PlatformActivity }) {
  const t = await getTranslations('admin.overview.activity')

  const cells = [
    { label: t('totalOrgs'), value: activity.totalOrganizations },
    { label: t('activeOrgs'), value: activity.activeOrganizationsLast30Days },
    { label: t('newOrgs'), value: activity.newOrganizationsThisMonth },
    { label: t('lessons'), value: activity.lessonsThisMonth },
  ]

  return (
    <section className="mb-6 rounded-xl border border-border bg-background px-5 py-4">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t('title')}
      </h2>
      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cells.map((c) => (
          <div key={c.label}>
            <dt className="text-xs text-muted-foreground">{c.label}</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums">
              {c.value.toLocaleString()}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
