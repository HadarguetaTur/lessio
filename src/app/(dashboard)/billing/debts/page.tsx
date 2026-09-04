import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Wallet } from 'lucide-react'
import { getSession } from '@/lib/auth/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getLocale, getTranslations } from 'next-intl/server'
import { LiveRefresh } from '@/lib/realtime/LiveRefresh'
import { getDebtorsOverview } from '@/lib/charges/debtors'
import { getPaymentConfirmationDefault } from '@/lib/organizations/paymentNotification'
import { formatCurrency } from '@/lib/i18n/formatCurrency'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { DebtorsList } from './DebtorsList'
import {
  waiveChargeAction,
  voidChargeAction,
  recordChargePaymentAction,
  settleParentBalanceAction,
  settleChargesAction,
} from '../../charges/actions'
import { sendDebtRemindersAction, sendConsolidatedRequestsAction } from './actions'

export default async function DebtsPage() {
  const { orgId, role } = await getSession()

  // Teachers never see money screens — same gate as the rest of /billing.
  if (role !== 'owner' && role !== 'admin') {
    redirect('/dashboard')
  }

  const [{ rows, totalDebt, debtorCount }, t, locale, defaultNotifyParent] = await Promise.all([
    getDebtorsOverview(orgId),
    getTranslations('debts'),
    getLocale(),
    getPaymentConfirmationDefault(orgId),
  ])

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <LiveRefresh tables={['charges']} />
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      {rows.length === 0 ? (
        <>
          <EmptyState icon={Wallet} title={t('empty')} />
          {/* "No open debts" is only half an answer at month end: money that
              has been calculated but not yet approved is invisible to this
              page, so an owner mid-billing was told they were owed nothing
              while bills sat waiting (UX audit 8, F-M1). */}
          <PendingApprovalNote orgId={orgId} />
        </>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-1 gap-4 rounded-xl border border-border bg-card p-5 md:grid-cols-2">
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t('totalDebt')}
              </p>
              <p className="text-lg font-bold text-amber-700 dark:text-amber-400">
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
            defaultNotifyParent={defaultNotifyParent}
            sendRemindersAction={sendDebtRemindersAction}
            sendPaymentRequestsAction={sendConsolidatedRequestsAction}
            recordPaymentAction={recordChargePaymentAction}
            settleAction={settleParentBalanceAction}
            settleChargesAction={settleChargesAction}
            waiveAction={waiveChargeAction}
            voidAction={voidChargeAction}
          />
        </>
      )}
    </div>
  )
}

/** Unapproved bills are real money the debtors view cannot see. */
async function PendingApprovalNote({ orgId }: { orgId: string }) {
  const [t, locale] = await Promise.all([getTranslations('debts'), getLocale()])

  const { data } = await createServiceRoleClient()
    .from('student_monthly_billing')
    .select('total_amount')
    .eq('organization_id', orgId)
    .eq('is_approved', false)
    .eq('is_paid', false)

  const pending = data ?? []
  if (pending.length === 0) return null

  const sum = pending.reduce((acc, r) => acc + Number(r.total_amount ?? 0), 0)

  return (
    <p className="mx-auto max-w-md rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm text-amber-800">
      {t('pendingApprovalNote', { count: pending.length, total: formatCurrency(sum, locale) })}{' '}
      <Link href="/billing" className="font-medium underline underline-offset-2">
        {t('pendingApprovalLink')}
      </Link>
    </p>
  )
}
