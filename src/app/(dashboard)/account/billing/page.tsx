import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { getSession } from '@/lib/auth/session'
import { getSaasPlanById } from '@/lib/saas/plans'
import {
  getOrgSubscriptionState,
  isTrialExpired,
  listSaasInvoices,
} from '@/lib/saas/subscriptions'
import { PageHeader } from '@/components/ui/page-header'
import { parseAppLocale, toIntlLocale } from '@/lib/i18n/locale'
import { getLocale } from 'next-intl/server'
import { DateTime } from 'luxon'
import { getOrgTimezone } from '@/lib/organizations'
import { CancelSaasButton } from './CancelSaasButton'

export default async function AccountBillingPage() {
  const session = await getSession()
  const t = await getTranslations('saas.accountBilling')
  const locale = await getLocale()
  const intlLocale = toIntlLocale(parseAppLocale(locale))

  if (session.role !== 'owner') {
    return (
      <div className="space-y-4">
        <PageHeader title={t('title')} subtitle={t('subtitle')} />
        <p className="text-sm text-muted-foreground">{t('ownerOnly')}</p>
        <Link href="/dashboard" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
          Dashboard
        </Link>
      </div>
    )
  }

  const [state, invoices, timezone] = await Promise.all([
    getOrgSubscriptionState(session.orgId),
    listSaasInvoices(session.orgId),
    getOrgTimezone(session.orgId),
  ])

  const plan = state ? await getSaasPlanById(state.planId) : null
  const planLabel =
    plan != null ? (locale === 'he' ? plan.display_name_he : plan.display_name_en) : '—'

  const statusKey =
    state?.status === 'trial' && !isTrialExpired(state)
      ? 'statusTrial'
      : state?.status === 'trial' && isTrialExpired(state)
        ? 'statusReadOnly'
        : state?.status === 'active'
          ? 'statusActive'
          : state?.status === 'pending_payment'
            ? 'statusPending'
            : state?.status === 'read_only'
              ? 'statusReadOnly'
              : 'statusPending'

  const legacyNoRow = !state

  const renews =
    state?.currentPeriodEnd != null
      ? DateTime.fromISO(state.currentPeriodEnd, { zone: timezone }).toLocaleString(
          DateTime.DATE_MED,
          { locale: intlLocale }
        )
      : null

  return (
    <div className="space-y-8">
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      <section className="rounded-xl border border-border bg-card p-5 space-y-3 max-w-xl">
        <h2 className="text-sm font-semibold text-foreground">{t('currentPlan')}</h2>
        {legacyNoRow ? (
          <p className="text-sm text-muted-foreground">{t('legacyNoSubscription')}</p>
        ) : (
          <>
        <p className="text-lg font-medium text-foreground">{planLabel}</p>
        <p className="text-sm text-muted-foreground">
          {t('status')}: {t(statusKey)}
        </p>
        {renews ? (
          <p className="text-sm text-muted-foreground">
            {t('renewsAt')}: {renews}
          </p>
        ) : null}
        <div className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{t('card')}: </span>
          {state?.cardLastFour
            ? t('cardLastFour', { digits: state.cardLastFour })
            : t('cardUnknown')}
        </div>
        {state?.cancelAtPeriodEnd ? (
          <p className="text-sm text-amber-700 dark:text-amber-400">{t('cancelPending')}</p>
        ) : null}
        {!session.isSupportMode && state?.status === 'active' && !state.cancelAtPeriodEnd ? (
          <CancelSaasButton />
        ) : null}
          </>
        )}
        <p className="text-xs text-muted-foreground pt-2">{t('upgradeHint')}</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">{t('invoices')}</h2>
        {invoices.length === 0 ? (
          <p className="text-sm text-muted-foreground">—</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-start">
                  <th className="px-3 py-2 font-medium">{t('invoiceAmount')}</th>
                  <th className="px-3 py-2 font-medium">{t('invoicePeriod')}</th>
                  <th className="px-3 py-2 font-medium">{t('invoiceStatus')}</th>
                  <th className="px-3 py-2 font-medium">{t('invoiceLink')}</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => {
                  const start =
                    inv.billing_period_start != null
                      ? DateTime.fromISO(inv.billing_period_start, { zone: timezone }).toLocaleString(
                          DateTime.DATE_SHORT,
                          { locale: intlLocale }
                        )
                      : '—'
                  const end =
                    inv.billing_period_end != null
                      ? DateTime.fromISO(inv.billing_period_end, { zone: timezone }).toLocaleString(
                          DateTime.DATE_SHORT,
                          { locale: intlLocale }
                        )
                      : '—'
                  const paid = inv.status === 'paid'
                  return (
                    <tr key={inv.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 whitespace-nowrap">
                        {new Intl.NumberFormat(intlLocale, {
                          style: 'currency',
                          currency: inv.currency ?? 'ILS',
                        }).format(Number(inv.amount))}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {start} – {end}
                      </td>
                      <td className="px-3 py-2">{paid ? t('invoicePaid') : t('invoicePending')}</td>
                      <td className="px-3 py-2">
                        {inv.sumit_document_url ? (
                          <a
                            href={inv.sumit_document_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary underline-offset-4 hover:underline"
                          >
                            {t('openPdf')}
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
