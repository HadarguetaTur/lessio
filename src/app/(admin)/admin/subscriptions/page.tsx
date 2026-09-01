import { requirePlatformSession } from '@/lib/superadmin/session'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { DateTime } from 'luxon'

import { listActiveSaasPlans } from '@/lib/saas/plans'
import { listSubscriptions } from '@/lib/superadmin/metrics'
import { formatMoney } from '@/lib/i18n/formatCurrency'
import { PageHeader } from '@/components/ui/page-header'
import { AdminTable, type AdminTableRow } from '@/components/admin/AdminTable'
import { SubscriptionActions } from '@/components/admin/SubscriptionActions'
import { SubscriptionStatusBadge } from '@/components/admin/SubscriptionStatusBadge'
import {
  cancelSubscriptionAction,
  changePlanAction,
  extendTrialAction,
  setSubscriptionStatusAction,
} from './actions'

/**
 * Every subscription, with the operator controls attached.
 *
 * Per /docs/sprint-34-scope.md § /admin/subscriptions. Nothing in the admin
 * panel previously showed which org was on which plan, when a trial ended, or
 * that a renewal had failed.
 */

type Queue = 'all' | 'past_due' | 'trial' | 'cancelling'

const QUEUES: Queue[] = ['all', 'past_due', 'trial', 'cancelling']

interface Props {
  searchParams: Promise<{ queue?: string }>
}

export default async function AdminSubscriptionsPage({ searchParams }: Props) {
  await requirePlatformSession('billing.read')

  const t = await getTranslations('admin.subscriptions')
  const tTable = await getTranslations('admin.table')
  const locale = await getLocale()
  const { queue: queueParam } = await searchParams

  const queue: Queue = QUEUES.includes(queueParam as Queue) ? (queueParam as Queue) : 'all'

  const [subs, plans] = await Promise.all([listSubscriptions(), listActiveSaasPlans()])

  const filtered = subs.filter((s) => {
    if (queue === 'past_due') return s.status === 'past_due'
    if (queue === 'trial') return s.status === 'trial'
    if (queue === 'cancelling') return s.cancelAtPeriodEnd && s.status !== 'cancelled'
    return true
  })

  const planOptions = plans.map((p) => ({
    id: p.id,
    label: locale === 'he' ? p.display_name_he : p.display_name_en,
    priceMonthly: p.price_monthly,
  }))

  const fmtDate = (iso: string | null) =>
    iso ? DateTime.fromISO(iso).setLocale(locale).toFormat('dd LLL yyyy') : null

  const rows: AdminTableRow[] = filtered.map((s) => ({
    id: s.id,
    cells: {
      org: (
        <Link
          href={`/admin/orgs/${s.organizationId}`}
          className="font-medium hover:underline"
        >
          {s.organizationName}
        </Link>
      ),
      plan: (
        <span>
          {locale === 'he' ? s.planLabelHe : s.planLabelEn}
          <span className="ms-1.5 text-xs text-muted-foreground">
            {t(s.billingInterval === 'yearly' ? 'yearlyShort' : 'monthlyShort')}
          </span>
        </span>
      ),
      status: <SubscriptionStatusBadge status={s.status} cancelAtPeriodEnd={s.cancelAtPeriodEnd} />,
      mrr:
        s.status === 'active' || s.status === 'past_due'
          ? formatMoney(Math.round(s.monthlyValue), locale)
          : null,
      renews: fmtDate(s.status === 'trial' ? s.trialEndsAt : s.currentPeriodEnd),
      card: s.cardLastFour ? `•••• ${s.cardLastFour}` : null,
      actions: (
        <SubscriptionActions
          orgId={s.organizationId}
          currentPlanId={s.planId}
          currentInterval={s.billingInterval}
          status={s.status}
          plans={planOptions}
          changePlanAction={changePlanAction}
          extendTrialAction={extendTrialAction}
          setStatusAction={setSubscriptionStatusAction}
          cancelAction={cancelSubscriptionAction}
        />
      ),
    },
    sortValues: {
      org: s.organizationName,
      plan: s.planName,
      status: s.status,
      mrr: s.monthlyValue,
      renews: s.status === 'trial' ? s.trialEndsAt : s.currentPeriodEnd,
    },
    csv: {
      org: s.organizationName,
      plan: s.planName,
      status: s.status,
      mrr: Math.round(s.monthlyValue),
      renews: (s.status === 'trial' ? s.trialEndsAt : s.currentPeriodEnd) ?? '',
      card: s.cardLastFour ?? '',
    },
  }))

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={t('title')} subtitle={t('description')} />

      <nav className="mb-4 flex flex-wrap gap-1.5">
        {QUEUES.map((q) => {
          const count =
            q === 'all'
              ? subs.length
              : subs.filter((s) =>
                  q === 'past_due'
                    ? s.status === 'past_due'
                    : q === 'trial'
                      ? s.status === 'trial'
                      : s.cancelAtPeriodEnd && s.status !== 'cancelled'
                ).length

          return (
            <Link
              key={q}
              href={q === 'all' ? '/admin/subscriptions' : `/admin/subscriptions?queue=${q}`}
              className={
                q === queue
                  ? 'rounded-full bg-foreground px-3 py-1 text-xs font-medium text-background'
                  : 'rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted'
              }
            >
              {t(`queue.${q}`)}
              <span className="ms-1.5 tabular-nums opacity-70">{count}</span>
            </Link>
          )
        })}
      </nav>

      <AdminTable
        exportName="lessio-subscriptions"
        emptyLabel={tTable('empty')}
        columns={[
          { key: 'org', label: t('columns.org'), sortable: true },
          { key: 'plan', label: t('columns.plan'), sortable: true },
          { key: 'status', label: t('columns.status'), sortable: true },
          { key: 'mrr', label: t('columns.mrr'), numeric: true, align: 'end', sortable: true },
          { key: 'renews', label: t('columns.renews'), numeric: true, sortable: true },
          { key: 'card', label: t('columns.card'), numeric: true, secondary: true },
          { key: 'actions', label: '', align: 'end' },
        ]}
        rows={rows}
      />
    </div>
  )
}
