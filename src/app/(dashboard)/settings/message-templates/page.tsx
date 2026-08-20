import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/auth/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { MessageTemplateCard } from '@/components/dashboard/settings/MessageTemplateCard'
import { RefreshTemplateStatusButton } from './RefreshTemplateStatusButton'
import { parseAppLocale, type AppLocale } from '@/lib/i18n/locale'
import {
  DEFAULT_TEMPLATES,
  TEMPLATE_LABELS,
  TEMPLATE_VARIABLES,
  TEMPLATE_PREVIEW_VARS,
  type MessageTemplateType,
} from '@/lib/whatsapp/templates'
import { SUBMITTABLE_TYPES } from '@/lib/whatsapp/submitTemplate'
import {
  getTemplateStatuses,
  refreshTemplateStatusesFromMeta,
  type TemplateStatusRow,
} from '@/lib/whatsapp/templateStatus'
import { resolveTemplateApproval } from '@/lib/whatsapp/templateApprovalView'
import { decryptToken } from '@/lib/crypto'

/**
 * Message templates settings page — owner only.
 * Per /docs/sprint-16-scope.md § Story 3.
 *
 * Templates are per-language: the ?lang tab picks which set is edited. The bot
 * resolves a recipient's language at send time, so both sets can be customised
 * independently.
 *
 * The page is split by where a template is sent from. Types Lessio only ever
 * sends as a reply (inside the 24h window) are pure free text and need nothing
 * from Meta. Types sent proactively must exist as a Meta-approved template, so
 * those cards also carry an approval status and a submit action.
 *
 * The status shown is the status of the *saved wording*, not of the last
 * submission — see resolveTemplateApproval. Saving an edit therefore flips the
 * chip to "not submitted" immediately, and the card says what is being sent
 * out of window in the meantime.
 */

const ALL_TYPES = Object.keys(DEFAULT_TEMPLATES.he) as MessageTemplateType[]

/**
 * Sent outside the 24h window, so Meta approval applies.
 * `lesson_cancelled_by_teacher` is here for its status only — its Meta template
 * carries a quick-reply button, which is a different submission shape, so it
 * stays on Lessio's built-in copy.
 */
const OUT_OF_WINDOW_TYPES: MessageTemplateType[] = [
  ...SUBMITTABLE_TYPES,
  'lesson_cancelled_by_teacher',
]

const LANG_TABS: Array<{ locale: AppLocale; label: string }> = [
  { locale: 'he', label: 'עברית' },
  { locale: 'en', label: 'English' },
]

/**
 * Reads stored statuses, pulling them from the WABA first when none exist yet.
 *
 * The status webhook only fires on a transition, so an org that connected
 * before subscribing (or that never had a transition) would otherwise open
 * this page to a column of "unknown" chips until someone presses refresh. A
 * failed catch-up is not fatal — the page just shows what it has.
 */
async function loadStatusesWithCatchUp(
  db: ReturnType<typeof createServiceRoleClient>,
  orgId: string
): Promise<TemplateStatusRow[]> {
  const existing = await getTemplateStatuses(orgId)
  if (existing.length > 0) return existing

  const { data: org } = await db
    .from('organizations')
    .select('whatsapp_waba_id, whatsapp_access_token')
    .eq('id', orgId)
    .maybeSingle()
  if (!org?.whatsapp_waba_id || !org?.whatsapp_access_token) return existing

  try {
    await refreshTemplateStatusesFromMeta(orgId, org.whatsapp_waba_id, decryptToken(org.whatsapp_access_token))
  } catch (err) {
    console.warn('[message-templates] Initial status catch-up failed', { orgId, err })
    return existing
  }
  return getTemplateStatuses(orgId)
}

export default async function MessageTemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>
}) {
  const { orgId, role } = await getSession()
  const t = await getTranslations('settings.messageTemplates')

  if (role !== 'owner') redirect('/settings')

  const { lang } = await searchParams
  const locale = parseAppLocale(lang)
  // The dashboard's own language, not the language being edited — labels and
  // status chips should read in the language the person is working in.
  const uiLocale = parseAppLocale(await getLocale())

  const db = createServiceRoleClient()
  const [{ data: rows }, statusRows] = await Promise.all([
    db
      .from('message_templates')
      .select('type, body_template')
      .eq('organization_id', orgId)
      .eq('locale', locale),
    loadStatusesWithCatchUp(db, orgId),
  ])

  const customMap = new Map<string, string>(
    (rows ?? []).map(r => [r.type, r.body_template])
  )

  const renderCard = (type: MessageTemplateType) => {
    const customBody = customMap.get(type) ?? null
    const savedBody = customBody ?? DEFAULT_TEMPLATES[locale][type]
    const approval = OUT_OF_WINDOW_TYPES.includes(type)
      ? resolveTemplateApproval(statusRows, type, locale, savedBody, customBody !== null)
      : null

    return (
      <MessageTemplateCard
        key={`${locale}:${type}`}
        type={type}
        locale={locale}
        label={TEMPLATE_LABELS[uiLocale][type]}
        defaultBody={DEFAULT_TEMPLATES[locale][type]}
        customBody={customBody}
        variables={TEMPLATE_VARIABLES[type]}
        previewVars={TEMPLATE_PREVIEW_VARS[type]}
        submittable={SUBMITTABLE_TYPES.includes(type)}
        needsApproval={OUT_OF_WINDOW_TYPES.includes(type)}
        approval={approval}
      />
    )
  }

  const outOfWindow = ALL_TYPES.filter(t => OUT_OF_WINDOW_TYPES.includes(t))
  const inWindow = ALL_TYPES.filter(t => !OUT_OF_WINDOW_TYPES.includes(t))

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>
        <p className="text-sm text-gray-500 mt-1">{t('description')}</p>
      </div>

      {/* Language tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {LANG_TABS.map(tab => (
          <Link
            key={tab.locale}
            href={`/settings/message-templates?lang=${tab.locale}`}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab.locale === locale
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      <section className="space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">{t('sections.approvalTitle')}</h2>
            <p className="text-xs text-gray-500 mt-0.5">{t('sections.approvalDescription')}</p>
          </div>
          <RefreshTemplateStatusButton />
        </div>
        {outOfWindow.map(renderCard)}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">{t('sections.inWindowTitle')}</h2>
          <p className="text-xs text-gray-500 mt-0.5">{t('sections.inWindowDescription')}</p>
        </div>
        {inWindow.map(renderCard)}
      </section>
    </div>
  )
}
