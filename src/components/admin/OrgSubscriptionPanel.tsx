import { getLocale, getTranslations } from 'next-intl/server'
import { DateTime } from 'luxon'
import { ExternalLink } from 'lucide-react'

import { formatMoney } from '@/lib/i18n/formatCurrency'
import type { SubscriptionRow } from '@/lib/superadmin/metrics'
import type { SaasInvoiceRow } from '@/lib/superadmin/revenue'
import { SubscriptionActions, type PlanOption } from './SubscriptionActions'
import { SubscriptionStatusBadge } from './SubscriptionStatusBadge'
import type { SubscriptionActionState } from '@/app/(admin)/admin/subscriptions/actions'

/**
 * The org's relationship with Lessio: plan, state, invoices, and the controls
 * to change any of it.
 *
 * Per /docs/sprint-34-scope.md § /admin/orgs/[id] — the "מנוי" tab.
 */

type ActionFn = (
  prev: SubscriptionActionState | null,
  formData: FormData
) => Promise<SubscriptionActionState>

export async function OrgSubscriptionPanel({
  orgId,
  subscription,
  invoices,
  plans,
  changePlanAction,
  extendTrialAction,
  setStatusAction,
  cancelAction,
}: {
  orgId: string
  subscription: SubscriptionRow | null
  invoices: SaasInvoiceRow[]
  plans: PlanOption[]
  changePlanAction: ActionFn
  extendTrialAction: ActionFn
  setStatusAction: ActionFn
  cancelAction: ActionFn
}) {
  const t = await getTranslations('admin.subscriptions')
  const tRev = await getTranslations('admin.revenue')
  const locale = await getLocale()

  const money = (n: number) => formatMoney(Math.round(n), locale)
  const fmtDate = (iso: string | null) =>
    iso ? DateTime.fromISO(iso).setLocale(locale).toFormat('dd LLL yyyy') : '—'

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border bg-background p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">{t('title')}</h2>
            {subscription ? (
              <p className="mt-1 text-2xl font-bold">
                {locale === 'he' ? subscription.planLabelHe : subscription.planLabelEn}
                <span className="ms-2 text-sm font-normal text-muted-foreground">
                  {t(subscription.billingInterval === 'yearly' ? 'yearlyShort' : 'monthlyShort')}
                </span>
              </p>
            ) : (
              // A grandfathered tenant predates platform billing entirely.
              // "Change plan" upserts a row for it, which is the fix.
              <p className="mt-1 text-sm text-muted-foreground">{t('noSubscription')}</p>
            )}
          </div>

          <SubscriptionActions
            orgId={orgId}
            currentPlanId={subscription?.planId ?? null}
            currentInterval={subscription?.billingInterval ?? 'monthly'}
            status={subscription?.status ?? null}
            plans={plans}
            changePlanAction={changePlanAction}
            extendTrialAction={extendTrialAction}
            setStatusAction={setStatusAction}
            cancelAction={cancelAction}
          />
        </div>

        {subscription && (
          <dl className="grid grid-cols-2 gap-4 border-t border-border pt-4 lg:grid-cols-4">
            <div>
              <dt className="text-xs text-muted-foreground">{t('columns.status')}</dt>
              <dd className="mt-1">
                <SubscriptionStatusBadge
                  status={subscription.status}
                  cancelAtPeriodEnd={subscription.cancelAtPeriodEnd}
                />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t('columns.mrr')}</dt>
              <dd className="mt-1 text-sm font-medium tabular-nums">
                {subscription.status === 'active' || subscription.status === 'past_due'
                  ? money(subscription.monthlyValue)
                  : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t('columns.renews')}</dt>
              <dd className="mt-1 text-sm font-medium tabular-nums">
                {fmtDate(
                  subscription.status === 'trial'
                    ? subscription.trialEndsAt
                    : subscription.currentPeriodEnd
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t('columns.card')}</dt>
              <dd className="mt-1 text-sm font-medium tabular-nums">
                {subscription.cardLastFour ? `•••• ${subscription.cardLastFour}` : '—'}
              </dd>
            </div>
          </dl>
        )}
      </section>

      <section className="rounded-xl border border-border bg-background">
        <h2 className="border-b border-border px-5 py-3 text-sm font-semibold">
          {tRev('invoices')}
        </h2>
        {invoices.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">
            {tRev('noHistory')}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {invoices.map((inv) => (
              <li key={inv.id} className="flex items-center gap-4 px-5 py-3 text-sm">
                <span className="tabular-nums text-muted-foreground">
                  {fmtDate(inv.issuedAt ?? inv.createdAt)}
                </span>
                <span className="font-medium tabular-nums">{money(inv.amount)}</span>
                <span className="text-xs text-muted-foreground">
                  {tRev(`status.${inv.status}`)}
                </span>
                {inv.documentUrl && (
                  <a
                    href={inv.documentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ms-auto inline-flex items-center gap-1 text-xs hover:underline"
                  >
                    {tRev('viewDocument')}
                    <ExternalLink size={11} />
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
