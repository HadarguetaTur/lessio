import { redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { parseAppLocale, toIntlLocale } from '@/lib/i18n/locale'
import { getPortalSession } from '@/lib/portal/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { PortalTabBar } from '@/components/portal/PortalTabBar'

/**
 * Portal payments — pending charges with payment links + payment history.
 * Per /docs/sprint-13-scope.md § Story 7.
 */
export default async function PortalPaymentsPage({
  params,
}: {
  params: Promise<{ orgId: string }>
}) {
  const { orgId } = await params
  const session = await getPortalSession()

  if (!session || session.orgId !== orgId) {
    redirect(`/portal/${orgId}/login`)
  }

  const [t, locale] = await Promise.all([
    getTranslations('portal.payments'),
    getLocale(),
  ])
  const intlLocale = toIntlLocale(parseAppLocale(locale))

  const db = createServiceRoleClient()

  const { data: charges } = await db
    .from('charges')
    .select('id, amount, status, charge_type, payment_link, receipt_url, created_at, paid_at')
    .eq('parent_id', session.parentId)
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(50)

  const pending = (charges ?? []).filter((c) => c.status === 'pending' || c.status === 'invoiced')
  const paid    = (charges ?? []).filter((c) => c.status === 'paid').slice(0, 20)

  function formatAmount(amount: number) {
    return new Intl.NumberFormat(intlLocale, { style: 'currency', currency: 'ILS' }).format(
      Number(amount)
    )
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString(intlLocale, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  }

  // next-intl throws on missing keys — guard unknown charge types with the raw value.
  const KNOWN_CHARGE_TYPES = new Set(['lesson', 'cancellation', 'manual', 'monthly'])
  const chargeTypeLabel = (type: string) =>
    KNOWN_CHARGE_TYPES.has(type) ? t(`chargeType.${type}`) : type

  return (
    <div className="flex flex-col flex-1 pb-16">
      <header className="px-4 py-3 border-b border-gray-200">
        <h1 className="font-bold text-gray-900">{t('title')}</h1>
      </header>

      <main className="flex-1 p-4 space-y-6">
        {/* Pending charges */}
        <section>
          <h2 className="text-sm font-semibold text-gray-500 mb-3">{t('pendingTitle')}</h2>
          {pending.length === 0 ? (
            <p className="text-sm text-gray-400">{t('noOpenCharges')}</p>
          ) : (
            <div className="space-y-2">
              {pending.map((c) => (
                <div key={c.id} className="bg-white border border-gray-200 rounded-lg p-3 flex justify-between items-center">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{formatAmount(c.amount)}</p>
                    <p className="text-xs text-gray-500">
                      {chargeTypeLabel(c.charge_type)} · {formatDate(c.created_at)}
                    </p>
                  </div>
                  {c.payment_link ? (
                    <a
                      href={c.payment_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
                    >
                      {t('pay')}
                    </a>
                  ) : (
                    <span className="text-xs text-gray-400">{t('pending')}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Payment history */}
        {paid.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-gray-500 mb-3">{t('historyTitle')}</h2>
            <div className="space-y-2">
              {paid.map((c) => (
                <div key={c.id} className="bg-white border border-gray-100 rounded-lg p-3 flex justify-between items-center">
                  <div>
                    <p className="text-sm text-gray-700">{formatAmount(c.amount)}</p>
                    <p className="text-xs text-gray-400">
                      {chargeTypeLabel(c.charge_type)} · {c.paid_at ? formatDate(c.paid_at) : formatDate(c.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-green-600 font-medium">{t('paid')}</span>
                    {(c as { receipt_url?: string | null }).receipt_url && (
                      <a
                        href={(c as { receipt_url: string }).receipt_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 underline"
                      >
                        {t('receipt')}
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      <PortalTabBar orgId={orgId} active="payments" />
    </div>
  )
}
