import { forbidden } from 'next/navigation'
import { CheckCircle, AlertCircle } from 'lucide-react'
import { getSession } from '@/lib/auth/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { EmbeddedSignupButton } from './EmbeddedSignupButton'
import { DisconnectButton } from './DisconnectButton'
import { RegisterTemplatesButton } from './RegisterTemplatesButton'
import { AutomationsSettings } from './AutomationsSettings'
import { WhatsAppRequirements } from '@/components/dashboard/settings/WhatsAppRequirements'
import { WhatsAppUsageTab } from '@/components/dashboard/settings/WhatsAppUsageTab'
import { getWhatsAppUsage, parseUsageDays } from '@/lib/whatsapp/usageAnalytics'
import { getTranslations } from 'next-intl/server'

/**
 * WhatsApp Settings page — owner only.
 * Per /docs/sprint-7-scope.md § Story 3.
 *
 * Connected state:   shows the connected phone_number_id + Disconnect button.
 * Disconnected state: shows the Meta Embedded Signup button to connect a number.
 *
 * The Usage tab reports bot volume and operating cost from Meta's analytics.
 * Its fetch runs only on that tab, so the settings tab pays no Graph latency.
 */
export default async function WhatsAppSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; days?: string }>
}) {
  const tp = await getTranslations('settings')
  const { orgId, role } = await getSession()

  if (role !== 'owner') {
    forbidden()
  }

  const params = await searchParams
  const activeTab = params.tab === 'usage' ? 'usage' : 'settings'
  const usageDays = parseUsageDays(params.days)

  const db = createServiceRoleClient()
  const { data: org } = await db
    .from('organizations')
    .select(`
      id,
      whatsapp_phone_number_id,
      automation_lesson_reminder_enabled,
      automation_cancellation_enabled,
      automation_payment_request_enabled,
      automation_dunning_enabled,
      automation_new_leads_enabled,
      payment_confirmation_default_enabled,
      automation_lesson_reminder_hours,
      ai_assistant_enabled
    `)
    .eq('id', orgId)
    .single()

  const phoneNumberId = org?.whatsapp_phone_number_id ?? null
  const isConnected = Boolean(phoneNumberId)

  const metaAppId = process.env.META_APP_ID ?? ''
  const metaConfigId = process.env.NEXT_PUBLIC_META_CONFIG_ID ?? ''

  const t = await getTranslations('settings')

  const usageSummary =
    activeTab === 'usage' && isConnected ? await getWhatsAppUsage(orgId, usageDays) : null

  return (
    <div className={activeTab === 'usage' ? 'max-w-2xl' : 'max-w-xl'}>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">{t('whatsapp.title')}</h1>
      <p className="text-sm text-muted-foreground mb-6">{tp('whatsappPage.subtitle')}</p>

      {/* Tab navigation — the usage tab only makes sense once a number is
          connected, so it appears alongside the connected state. */}
      {isConnected && (
        <div className="flex gap-4 border-b border-gray-200 mb-8">
          <a
            href="?tab=settings"
            className={`pb-2 text-sm font-medium border-b-2 ${
              activeTab === 'settings'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-muted-foreground hover:text-gray-700'
            }`}
          >
            {t('whatsapp.tabSettings')}
          </a>
          <a
            href="?tab=usage"
            className={`pb-2 text-sm font-medium border-b-2 ${
              activeTab === 'usage'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-muted-foreground hover:text-gray-700'
            }`}
          >
            {t('whatsapp.tabUsage')}
          </a>
        </div>
      )}

      {activeTab === 'usage' && isConnected ? (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          {usageSummary ? (
            <WhatsAppUsageTab summary={usageSummary} days={usageDays} />
          ) : (
            <p className="text-sm text-muted-foreground">{t('whatsappUsage.notConnected')}</p>
          )}
        </div>
      ) : (
      <>
      {/* Prerequisites come before the button, not after it: two of the three
          take days to obtain, and the third quietly disables the number in the
          WhatsApp app. Reading them after clicking Connect is too late. */}
      {!isConnected && <WhatsAppRequirements className="mb-6" />}

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        {isConnected ? (
          <ConnectedState phoneNumberId={phoneNumberId!} connectedLabel={t('whatsapp.connected')} />
        ) : (
          <DisconnectedState metaAppId={metaAppId} metaConfigId={metaConfigId} />
        )}
      </div>

      {/* Message templates — shown when WhatsApp is connected */}
      {isConnected && (
        <div className="mt-6 bg-white rounded-lg border border-gray-200 p-5">
          <RegisterTemplatesButton />
        </div>
      )}

      {/* The parent-portal link used to sit here. It moved to
          /settings/parent-portal, next to the toggles that decide what a
          parent finds behind it. */}

      {/* Automations — shown when WhatsApp is connected */}
      {isConnected && org && (
        <div className="mt-6">
          <AutomationsSettings
            org={{
              automation_lesson_reminder_enabled:   org.automation_lesson_reminder_enabled ?? true,
              automation_cancellation_enabled:      org.automation_cancellation_enabled ?? true,
              automation_payment_request_enabled:   org.automation_payment_request_enabled ?? true,
              automation_dunning_enabled:           org.automation_dunning_enabled ?? false,
              automation_new_leads_enabled:         org.automation_new_leads_enabled ?? true,
              payment_confirmation_default_enabled: org.payment_confirmation_default_enabled ?? true,
              automation_lesson_reminder_hours:     org.automation_lesson_reminder_hours ?? 24,
              ai_assistant_enabled:                 org.ai_assistant_enabled ?? false,
            }}
          />
        </div>
      )}
      </>
      )}

    </div>
  )
}

async function ConnectedState({ phoneNumberId, connectedLabel }: { phoneNumberId: string; connectedLabel: string }) {
  const tp = await getTranslations('settings')
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-green-700">
        <CheckCircle size={20} />
        <span className="font-medium text-sm">{connectedLabel}</span>
      </div>

      <dl className="text-sm space-y-2">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Phone Number ID</dt>
          <dd className="font-mono text-gray-900 text-xs">{phoneNumberId}</dd>
        </div>
      </dl>

      <hr className="border-gray-100" />

      <div>
        <p className="text-xs text-muted-foreground mb-2">{tp('whatsappPage.disconnectHint')}</p>
        <DisconnectButton />
      </div>
    </div>
  )
}

async function DisconnectedState({ metaAppId, metaConfigId }: { metaAppId: string; metaConfigId: string }) {
  const tp = await getTranslations('settings')
  const missingVar = !metaAppId ? 'META_APP_ID' : !metaConfigId ? 'NEXT_PUBLIC_META_CONFIG_ID' : null

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <AlertCircle size={20} />
        <span className="font-medium text-sm">{tp('googleCommon.notConnected')}</span>
      </div>

      <p className="text-sm text-gray-600">{tp('whatsappPage.disconnectedHint')}</p>

      {missingVar === null ? (
        <EmbeddedSignupButton metaAppId={metaAppId} metaConfigId={metaConfigId} />
      ) : (
        <p className="text-sm text-red-600">
          {tp('whatsappPage.missingVar', { name: missingVar })}
        </p>
      )}
    </div>
  )
}
