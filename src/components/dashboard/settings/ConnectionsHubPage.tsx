import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { Check, ChevronLeft } from 'lucide-react'
import { getSession } from '@/lib/auth/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getNavigationSaasFeatures } from '@/lib/saas/subscriptions'
import {
  CONNECTIONS_HUB,
  SETTINGS_GROUPS,
  filterNav,
  type ConnectionId,
} from '@/lib/navigation/registry'
import { getProviderUI } from '@/lib/payments/registry-ui'
import { listApiKeys } from '@/lib/api/store'
import { PageHeader } from '@/components/ui/page-header'
import { Badge } from '@/components/ui/badge'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

type ConnectionStatus = {
  /** 'configured' = credentials saved but never verified (payment/receipts honesty). */
  state: 'connected' | 'configured' | 'none'
  detail?: string
}

/**
 * The connections tab landing: every external-service connection in one place,
 * grouped by purpose, each card carrying a live status badge. Statuses reuse the
 * exact presence checks the leaf pages themselves render from — one org read,
 * no credential decryption.
 */
export async function ConnectionsHubPage() {
  const { orgId, role } = await getSession()
  const group = SETTINGS_GROUPS.find((candidate) => candidate.id === 'connections')

  const [t, tNav, features] = await Promise.all([
    getTranslations('settings'),
    getTranslations('nav'),
    getNavigationSaasFeatures(orgId),
  ])

  const sections = CONNECTIONS_HUB.map((section) => {
    const visible = new Set(filterNav(section.items.map((item) => item.entry), role, features))
    return { ...section, items: section.items.filter((item) => visible.has(item.entry)) }
  }).filter((section) => section.items.length > 0)

  const visibleIds = new Set(
    sections.flatMap((section) => section.items.map((item) => item.connectionId))
  )

  const db = createServiceRoleClient()
  const [{ data: org }, apiKeys] = await Promise.all([
    db
      .from('organizations')
      .select(
        'payment_provider, receipt_config_encrypted, receipt_mode, receipt_provider, whatsapp_phone_number_id, gmail_connected_email, google_calendar_email, ai_config_encrypted, ai_provider'
      )
      .eq('id', orgId)
      .single(),
    visibleIds.has('integrations') ? listApiKeys(orgId) : Promise.resolve([]),
  ])

  const paymentProviderUI = org?.payment_provider ? getProviderUI(org.payment_provider) : null
  const statuses: Record<ConnectionId, ConnectionStatus> = {
    payment: org?.payment_provider
      ? {
          state: 'configured',
          detail: paymentProviderUI
            ? t(`paymentProviders.${paymentProviderUI.id}.label` as Parameters<typeof t>[0])
            : org.payment_provider,
        }
      : { state: 'none' },
    receipts:
      org?.receipt_mode === 'payment_provider'
        ? { state: 'configured', detail: t('connectionsHub.status.viaPaymentProvider') }
        : org?.receipt_config_encrypted
          ? {
              state: 'configured',
              detail: t(
                `receiptProviders.${org.receipt_provider ?? 'green-invoice'}` as Parameters<
                  typeof t
                >[0]
              ),
            }
          : { state: 'none' },
    whatsapp: org?.whatsapp_phone_number_id ? { state: 'connected' } : { state: 'none' },
    email: org?.gmail_connected_email
      ? { state: 'connected', detail: org.gmail_connected_email }
      : { state: 'none' },
    aiAssistant: org?.ai_config_encrypted
      ? { state: 'connected', detail: org.ai_provider ?? undefined }
      : { state: 'none' },
    calendar: org?.google_calendar_email
      ? { state: 'connected', detail: org.google_calendar_email }
      : { state: 'none' },
    integrations:
      apiKeys.length > 0
        ? { state: 'connected', detail: t('connectionsHub.status.apiKeys', { count: apiKeys.length }) }
        : { state: 'none' },
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title={group ? tNav(group.navKey as Parameters<typeof tNav>[0]) : ''}
        subtitle={group ? t(group.descriptionKey as Parameters<typeof t>[0]) : undefined}
      />
      <div className="max-w-4xl space-y-8">
        {sections.map((section) => (
          <section key={section.id}>
            <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
              {t(`connectionsHub.sections.${section.titleKey}` as Parameters<typeof t>[0])}
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {section.items.map(({ entry, connectionId }) => {
                const { href, navKey, cardKey, icon: Icon } = entry
                const status = statuses[connectionId]
                const isOn = status.state !== 'none'
                return (
                  <Link key={href} href={href} className="group block">
                    <Card className="h-full border-border transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-sm">
                      <CardHeader className="h-full">
                        <div className="flex h-full items-start gap-3">
                          <div className="mt-0.5 rounded-lg bg-primary/10 p-2 text-primary">
                            <Icon size={18} aria-hidden />
                          </div>
                          <div className="min-w-0 flex-1">
                            <CardTitle>{tNav(navKey as Parameters<typeof tNav>[0])}</CardTitle>
                            <CardDescription className="mt-1.5 leading-5">
                              {t(`cards.${cardKey}.description` as Parameters<typeof t>[0])}
                            </CardDescription>
                            <div className="mt-2.5">
                              {isOn ? (
                                <Badge className="border-green-200 bg-green-50 text-green-700">
                                  <Check aria-hidden />
                                  <span className="truncate">
                                    {t(`connectionsHub.status.${status.state}`)}
                                    {status.detail ? ` · ${status.detail}` : ''}
                                  </span>
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-muted-foreground">
                                  {t('connectionsHub.status.notConnected')}
                                </Badge>
                              )}
                            </div>
                          </div>
                          <ChevronLeft
                            size={16}
                            aria-hidden
                            className="mt-1 shrink-0 text-muted-foreground transition-transform group-hover:-translate-x-0.5 ltr:rotate-180"
                          />
                        </div>
                      </CardHeader>
                    </Card>
                  </Link>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
