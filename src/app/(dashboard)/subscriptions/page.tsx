import Link from 'next/link'
import { DateTime } from 'luxon'
import { CreditCard } from 'lucide-react'
import { getSession } from '@/lib/auth/session'
import { getSubscriptions } from '@/lib/subscriptions'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusBadge } from '@/components/ui/status-badge'
import { UserAvatar } from '@/components/ui/user-avatar'
import { getLocale, getTranslations } from 'next-intl/server'
import { formatMoney } from '@/lib/i18n/formatCurrency'
import { commonError } from '@/lib/i18n/actionErrors'

function getSubscriptionStatus(sub: {
  is_paused: boolean
  end_date: string | null
}): 'active' | 'paused' | 'ended' {
  if (sub.is_paused) return 'paused'
  if (sub.end_date && sub.end_date < new Date().toISOString().slice(0, 10)) return 'ended'
  return 'active'
}

export default async function SubscriptionsPage(props: {
  searchParams: Promise<{ status?: string }>
}) {
  const searchParams = await props.searchParams
  const { orgId, role } = await getSession()

  if (role !== 'owner' && role !== 'admin') {
    return <div className="p-6 text-sm text-muted-foreground">{await commonError('noPermission')}</div>
  }

  const [t, tCommon, locale] = await Promise.all([
    getTranslations('subscriptions'),
    getTranslations('common'),
    getLocale(),
  ])
  const money = (amount: number) => formatMoney(amount, locale)
  const fmtDate = (iso: string) => DateTime.fromISO(iso).toFormat('d.M.yyyy')

  const statusFilter = searchParams.status as 'active' | 'paused' | 'all' | undefined
  const allSubs = await getSubscriptions(orgId)

  const subs = allSubs.filter((sub) => {
    const status = getSubscriptionStatus(sub)
    if (!statusFilter || statusFilter === 'all') return true
    return status === statusFilter
  })

  const FILTER_OPTIONS = [
    { value: 'active', label: t('status.active') },
    { value: 'paused', label: t('status.paused') },
    { value: 'all', label: tCommon('actions.showAll') },
  ]

  const STATUS_BADGE_MAP: Record<'active' | 'paused' | 'ended', string> = {
    active: 'completed',
    paused: 'cancelled',
    ended: 'no_show',
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <PageHeader title={t('title')} />

      {/* Status filter — pointless over an org with zero subscriptions. */}
      {allSubs.length > 0 && (
      <div className="mb-5 flex items-center gap-2">
        {FILTER_OPTIONS.map((opt) => {
          const active = (statusFilter ?? 'active') === opt.value
          return (
            <Link
              key={opt.value}
              href={`/subscriptions?status=${opt.value}`}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {opt.label}
            </Link>
          )
        })}
      </div>
      )}

      {subs.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title={t('noSubscriptions')}
          subtitle={allSubs.length === 0 ? t('noSubscriptionsHint') : undefined}
          action={
            allSubs.length === 0 ? (
              <Link
                href="/students"
                className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                {t('noSubscriptionsCta')}
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="h-full overflow-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="sticky top-0 z-10 bg-muted/95 px-5 py-3 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                    {tCommon('table.student')}
                  </th>
                  <th className="sticky top-0 z-10 bg-muted/95 px-5 py-3 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                    {t('fields.type')}
                  </th>
                  <th className="sticky top-0 z-10 bg-muted/95 px-5 py-3 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                    {t('fields.monthlyAmount')}
                  </th>
                  <th className="sticky top-0 z-10 bg-muted/95 px-5 py-3 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                    {t('fields.startDate')}
                  </th>
                  <th className="sticky top-0 z-10 bg-muted/95 px-5 py-3 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                    {t('fields.endDate')}
                  </th>
                  <th className="sticky top-0 z-10 bg-muted/95 px-5 py-3 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                    {t('fields.status')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {subs.map((sub) => {
                  const status = getSubscriptionStatus(sub)
                  const studentName = sub.student?.full_name ?? '—'
                  const studentId = sub.student_id
                  return (
                    <tr key={sub.id} className="transition-colors hover:bg-muted/20">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <UserAvatar name={studentName} />
                          <Link
                            href={`/students?openStudent=${studentId}`}
                            className="text-sm font-medium text-foreground hover:underline"
                          >
                            {studentName}
                          </Link>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-muted-foreground">
                        {sub.subscription_type && ['monthly', 'weekly', 'per_lesson'].includes(sub.subscription_type)
                          ? t(`types.${sub.subscription_type}` as 'types.monthly')
                          : (sub.subscription_type ?? '—')}
                      </td>
                      <td className="px-5 py-3.5 text-sm font-mono font-semibold text-foreground" dir="ltr">
                        {money(Number(sub.monthly_amount))}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-foreground">{fmtDate(sub.start_date)}</td>
                      <td className="px-5 py-3.5 text-sm text-foreground">{sub.end_date ? fmtDate(sub.end_date) : '—'}</td>
                      <td className="px-5 py-3.5">
                        <StatusBadge
                          status={STATUS_BADGE_MAP[status]}
                          label={t(`status.${status}`)}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
