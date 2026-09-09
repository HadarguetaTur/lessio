import { Suspense } from 'react'
import Link from 'next/link'
import { forbidden } from 'next/navigation'
import { AlertCircle } from 'lucide-react'
import { getPhoneIdentity } from '@/lib/whatsapp/phoneIdentity'
import { getSession } from '@/lib/auth/session'
import { commonError } from '@/lib/i18n/actionErrors'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getEffectiveSaasFeatures } from '@/lib/saas/subscriptions'
import { getWaConnectionState, type WaConnectionState } from '@/lib/whatsapp/connectionState'
import { WaStatusSummary } from '@/components/dashboard/settings/WaStatusBadge'
import { EmbeddedSignupButton } from './EmbeddedSignupButton'
import { DisconnectButton } from './DisconnectButton'
import { RegisterTemplatesButton } from './RegisterTemplatesButton'
import { AutomationsSettings } from './AutomationsSettings'
import { TrustCard } from './TrustCard'
import { WhatsAppRequirements } from '@/components/dashboard/settings/WhatsAppRequirements'
import { WhatsAppUsageTab } from '@/components/dashboard/settings/WhatsAppUsageTab'
import { getWhatsAppUsage, parseUsageDays } from '@/lib/whatsapp/usageAnalytics'
import { getTemplateStatuses } from '@/lib/whatsapp/templateStatus'
import { builtInTemplateName } from '@/lib/whatsapp/templateApprovalView'
import { OUT_OF_WINDOW_TYPES } from '@/lib/whatsapp/submitTemplate'
import { parseAppLocale } from '@/lib/i18n/locale'
import { getTranslations } from 'next-intl/server'

/**
 * WhatsApp Settings page — owner only.
 * Per /docs/sprint-7-scope.md § Story 3.
 *
 * The connection card reports `getWaConnectionState`, not the presence of a
 * phone_number_id. Before the 09.09 UX audit it rendered an unconditional green
 * check the moment credentials existed, then streamed in an amber "we could not
 * verify this" strip *underneath* it — two contradictory signals, with the
 * reassuring one on top (F1).
 *
 * The plan gate is here rather than only in the actions: `requireFeature` inside
 * saveWhatsAppConnection fires after the customer has completed Meta's entire
 * popup, burning the 30-second OAuth code and redirecting them to billing with
 * no explanation (F4). The wall belongs in front of the button.
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
  const session = await getSession()
  const { orgId, role } = session

  // Admins get the `whatsapp_health` notification too, and its action link
  // points here — so refusing them outright handed an admin a problem and a red
  // 403 page in the same breath (UX audit F20). They see the status and the
  // ladder; every control stays owner-only, and the write actions enforce that
  // independently, so this is a rendering change and not a permission one.
  if (role !== 'owner' && role !== 'admin') {
    forbidden()
  }
  const isOwner = role === 'owner'

  const params = await searchParams
  const activeTab = params.tab === 'usage' ? 'usage' : 'settings'
  const usageDays = parseUsageDays(params.days)

  const db = createServiceRoleClient()
  const features = await getEffectiveSaasFeatures(orgId)

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
      automation_exam_good_luck_enabled,
      exam_good_luck_hour,
      exam_good_luck_hours_before,
      ai_assistant_enabled
    `)
    .eq('id', orgId)
    .single()

  const phoneNumberId = org?.whatsapp_phone_number_id ?? null
  const waState = await getWaConnectionState(orgId, { checkTemplates: true, features })

  // "A number is stored", which decides which blocks the page renders. Whether
  // that number *works* is waState — the two are deliberately different
  // questions now, and conflating them is the bug this page was fixing.
  const isConnected = Boolean(phoneNumberId)
  const planLocked = waState.state === 'plan_locked'
  const showConnectedBlocks = isConnected && !planLocked

  // A superadmin in support mode and an owner whose subscription lapsed can
  // both read this page and neither may write. Saying so on the controls beats
  // letting the click through to an action that throws (UX audit F3).
  const readOnly = Boolean(session.isSupportMode || session.isSaasReadOnly) || !isOwner
  const readOnlyReason = session.isSupportMode
    ? await commonError('supportModeReadOnly')
    : session.isSaasReadOnly
      ? await commonError('saasReadOnly')
      : !isOwner
        ? tp('whatsappPage.adminReadOnly')
        : undefined

  const metaAppId = process.env.META_APP_ID ?? ''
  const metaConfigId = process.env.NEXT_PUBLIC_META_CONFIG_ID ?? ''
  if (!metaAppId || !metaConfigId) {
    console.error('[whatsapp/settings] Embedded Signup is not configured', {
      missing: !metaAppId ? 'META_APP_ID' : 'NEXT_PUBLIC_META_CONFIG_ID',
    })
  }

  const t = await getTranslations('settings')

  const usageSummary =
    activeTab === 'usage' && isConnected ? await getWhatsAppUsage(orgId, usageDays) : null

  return (
    <div className={activeTab === 'usage' ? 'max-w-2xl' : 'max-w-xl'}>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">{t('whatsapp.title')}</h1>
      <p className="text-sm text-muted-foreground mb-6">{tp('whatsappPage.subtitle')}</p>

      {/* Tab navigation. Shown to anyone on a plan that includes WhatsApp, not
          only once a number exists: "what is WhatsApp costing me?" is a fair
          question before connecting, and hiding the tab made its own
          "not connected yet" copy unreachable (UX audit F17). */}
      {!planLocked && (
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

      {activeTab === 'usage' && !planLocked ? (
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
          WhatsApp app. Reading them after clicking Connect is too late. Not
          shown to an org that cannot connect at all — telling them how to
          prepare for something their plan does not include is just noise. */}
      {!isConnected && !planLocked && <WhatsAppRequirements className="mb-6" />}

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        {planLocked ? (
          <PlanLockedState />
        ) : isConnected ? (
          <ConnectedState
            orgId={orgId}
            phoneNumberId={phoneNumberId!}
            status={waState}
            readOnly={readOnly}
            readOnlyReason={readOnlyReason}
          />
        ) : (
          <DisconnectedState metaAppId={metaAppId} metaConfigId={metaConfigId} isOwner={isOwner} />
        )}
      </div>

      {/* Where the number stands with Meta, and the next rung to climb */}
      {showConnectedBlocks && <TrustCard orgId={orgId} readOnly={readOnly} />}

      {/* Message templates — shown when WhatsApp is connected */}
      {showConnectedBlocks && (
        <div className="mt-6 bg-white rounded-lg border border-gray-200 p-5 space-y-4">
          <TemplateApprovalSummary orgId={orgId} />
          <RegisterTemplatesButton disabled={readOnly} disabledReason={readOnlyReason} />
        </div>
      )}

      {/* The parent-portal link used to sit here. It moved to
          /settings/parent-portal, next to the toggles that decide what a
          parent finds behind it. */}

      {/* Automations — shown when WhatsApp is connected */}
      {showConnectedBlocks && org && (
        <div className="mt-6">
          <AutomationsSettings
            aiAssistantOnPlan={features.ai_assistant}
            readOnly={readOnly}
            readOnlyReason={readOnlyReason}
            org={{
              automation_lesson_reminder_enabled:   org.automation_lesson_reminder_enabled ?? true,
              automation_cancellation_enabled:      org.automation_cancellation_enabled ?? true,
              automation_payment_request_enabled:   org.automation_payment_request_enabled ?? true,
              automation_dunning_enabled:           org.automation_dunning_enabled ?? false,
              automation_new_leads_enabled:         org.automation_new_leads_enabled ?? true,
              payment_confirmation_default_enabled: org.payment_confirmation_default_enabled ?? true,
              automation_lesson_reminder_hours:     org.automation_lesson_reminder_hours ?? 24,
              automation_exam_good_luck_enabled:    org.automation_exam_good_luck_enabled ?? true,
              exam_good_luck_hour:                  org.exam_good_luck_hour ?? 7,
              exam_good_luck_hours_before:          org.exam_good_luck_hours_before ?? 2,
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

async function ConnectedState({
  orgId,
  phoneNumberId,
  status,
  readOnly,
  readOnlyReason,
}: {
  orgId: string
  phoneNumberId: string
  status: WaConnectionState
  readOnly: boolean
  readOnlyReason?: string
}) {
  const tp = await getTranslations('settings')
  return (
    <div className="space-y-4">
      {/* One badge, one sentence, and — when it is not simply working — either
          the action or an explicit "nothing for you to do". */}
      <WaStatusSummary status={status} />

      {/* The number's human identity streams in from Meta so the page itself
          never waits on Graph. The technical ID stays as a secondary row. */}
      <Suspense
        fallback={
          <p className="text-sm text-muted-foreground">{tp('whatsappPage.identityLoading')}</p>
        }
      >
        <PhoneIdentityRows orgId={orgId} cached={status} />
      </Suspense>

      <dl className="text-sm space-y-2">
        <div className="flex justify-between">
          <dt className="text-muted-foreground text-xs">{tp('whatsappPage.phoneNumberId')}</dt>
          <dd className="font-mono text-gray-500 text-xs" dir="ltr">{phoneNumberId}</dd>
        </div>
      </dl>

      <hr className="border-gray-100" />

      <div>
        <p className="text-xs text-muted-foreground mb-2">{tp('whatsappPage.disconnectHint')}</p>
        <DisconnectButton disabled={readOnly} disabledReason={readOnlyReason} />
      </div>
    </div>
  )
}

/**
 * How many message types Meta has approved, and what it means that some are not.
 *
 * "Connected" and "can reach a parent who hasn't written this week" are
 * different facts, and until now the second one lived on a different page
 * behind a language tab that an owner had no reason to open — so a studio whose
 * templates had all been refused believed its reminders were going out
 * (UX audit F9).
 */
async function TemplateApprovalSummary({ orgId }: { orgId: string }) {
  const t = await getTranslations('settings.whatsapp.templates')

  const [statuses, orgLocale] = await Promise.all([
    getTemplateStatuses(orgId),
    createServiceRoleClient()
      .from('organizations')
      .select('default_locale')
      .eq('id', orgId)
      .maybeSingle()
      .then(({ data }) => parseAppLocale(data?.default_locale ?? undefined)),
  ])

  const total = OUT_OF_WINDOW_TYPES.length
  const approved = OUT_OF_WINDOW_TYPES.filter((type) => {
    const builtIn = builtInTemplateName(type, orgLocale)
    return statuses.some(
      (row) =>
        row.status === 'APPROVED' &&
        row.language === orgLocale &&
        (row.templateName === builtIn || row.type === type)
    )
  }).length

  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
      <p className="text-sm font-medium text-gray-900">
        {t('approvedCount', { approved, total })}
      </p>
      {approved < total && (
        <p className="mt-1 text-xs text-muted-foreground">{t('approvedConsequence')}</p>
      )}
      <Link
        href="/settings/message-templates"
        className="mt-2 inline-block text-xs font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900"
      >
        {t('approvedLink')}
      </Link>
    </div>
  )
}

/**
 * The plan wall. Deliberately rendered where the Connect button would be, so
 * the customer meets it before Meta rather than after — see the note at the top
 * of the file.
 */
async function PlanLockedState() {
  const t = await getTranslations('settings.whatsappState')
  return (
    <div className="space-y-4">
      <WaStatusSummary
        status={{
          state: 'plan_locked',
          reasons: [],
          needsAction: true,
          lastCheckedAt: null,
          displayPhoneNumber: null,
          verifiedName: null,
          hasNumber: false,
        }}
      />
      <Link
        href="/account/billing?upgrade=whatsapp_automation"
        className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
      >
        {t('viewPlans')}
      </Link>
    </div>
  )
}

/**
 * Who the connected number belongs to.
 *
 * The live read is still what runs — it is also how the page detects a dead
 * token and records it for the rest of the product. But when it fails, the
 * cached copy from the last successful health refresh is shown rather than
 * nothing: an owner investigating a broken connection is exactly who most needs
 * to see which number it is. The badge above has already said the connection is
 * not working, so there is no risk of the identity reading as reassurance.
 */
async function PhoneIdentityRows({
  orgId,
  cached,
}: {
  orgId: string
  cached: WaConnectionState
}) {
  const tp = await getTranslations('settings')
  const identity = await getPhoneIdentity(orgId)

  const verifiedName = identity.ok ? identity.verifiedName : cached.verifiedName
  const displayPhoneNumber = identity.ok
    ? identity.displayPhoneNumber
    : cached.displayPhoneNumber

  return (
    <dl className="text-sm space-y-2">
      {verifiedName && (
        <div className="flex justify-between">
          <dt className="text-muted-foreground">{tp('whatsappPage.verifiedName')}</dt>
          <dd className="font-medium text-gray-900">{verifiedName}</dd>
        </div>
      )}
      {displayPhoneNumber && (
        <div className="flex justify-between">
          <dt className="text-muted-foreground">{tp('whatsappPage.phoneNumber')}</dt>
          <dd className="font-medium text-gray-900" dir="ltr">
            {displayPhoneNumber}
          </dd>
        </div>
      )}
      {!identity.ok && !verifiedName && !displayPhoneNumber && (
        <p className="text-sm text-muted-foreground">
          {tp('whatsappPage.identityUnavailable')}
        </p>
      )}
    </dl>
  )
}

async function DisconnectedState({
  metaAppId,
  metaConfigId,
  isOwner,
}: {
  metaAppId: string
  metaConfigId: string
  isOwner: boolean
}) {
  const tp = await getTranslations('settings')
  const t = await getTranslations('settings.whatsappState')
  const missingVar = !metaAppId ? 'META_APP_ID' : !metaConfigId ? 'NEXT_PUBLIC_META_CONFIG_ID' : null

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <AlertCircle size={20} aria-hidden />
        <span className="font-medium text-sm">{t('not_connected.label')}</span>
      </div>

      {/* The value, before the cost. This page used to open with the amber
          prerequisites box and a sentence about each org having its own number;
          what WhatsApp actually does for the studio was said only in the
          onboarding wizard, which an owner may well have skipped (F19). */}
      <p className="text-sm text-gray-700">{tp('whatsappPage.valueSummary')}</p>
      <p className="text-sm text-gray-600">{tp('whatsappPage.disconnectedHint')}</p>

      {!isOwner ? (
        <p className="text-sm text-muted-foreground">{tp('whatsappPage.adminReadOnly')}</p>
      ) : missingVar === null ? (
        <EmbeddedSignupButton metaAppId={metaAppId} metaConfigId={metaConfigId} />
      ) : (
        /* A Lessio-side deployment fault, stated in Lessio-side deployment
           language. The customer can do nothing with an env var name and does
           not know it is not their fault (F14). */
        <p className="text-sm text-red-600">
          {tp('whatsappPage.setupUnavailable')}
        </p>
      )}
    </div>
  )
}
