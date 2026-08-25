import { redirect } from 'next/navigation'
import { Wallet } from 'lucide-react'
import { getSession } from '@/lib/auth/session'
import { getLocale, getTranslations } from 'next-intl/server'
import { LiveRefresh } from '@/lib/realtime/LiveRefresh'
import { getDebtorsOverview } from '@/lib/charges/debtors'
import { formatCurrency } from '@/lib/i18n/formatCurrency'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { DebtorsList } from './DebtorsList'
import {
  waiveChargeAction,
  voidChargeAction,
  recordChargePaymentAction,
} from '../../charges/actions'
import { sendDebtRemindersAction, sendConsolidatedRequestsAction } from './actions'

export default async function DebtsPage() {
  const { orgId, role } = await getSession()

  // Teachers never see money screens — same gate as the rest of /billing.
  if (role !== 'owner' && role !== 'admin') {
    redirect('/dashboard')
  }

  const [{ rows, totalDebt, debtorCount }, t, locale] = await Promise.all([
    getDebtorsOverview(orgId),
    getTranslations('debts'),
    getLocale(),
  ])

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <LiveRefresh tables={['charges']} />
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      {rows.length === 0 ? (
        <EmptyState icon={Wallet} title={t('empty')} />
      ) : (
        <>
          <div className="mb-5 grid grid-cols-1 gap-4 rounded-xl border border-border bg-card p-5 md:grid-cols-2">
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t('totalDebt')}
              </p>
              <p className="text-lg font-bold text-amber-600">
                {formatCurrency(totalDebt, locale)}
              </p>
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t('debtorCount')}
              </p>
              <p className="text-lg font-bold text-foreground">{debtorCount}</p>
            </div>
          </div>

          <DebtorsList
            rows={rows}
            locale={locale}
            isOwner={role === 'owner'}
            sendRemindersAction={sendDebtRemindersAction}
            sendPaymentRequestsAction={sendConsolidatedRequestsAction}
            recordPaymentAction={recordChargePaymentAction}
            waiveAction={waiveChargeAction}
            voidAction={voidChargeAction}
          />
        </>
      )}
    </div>
  )
}
