import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/auth/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { MessageTemplateCard } from '@/components/dashboard/settings/MessageTemplateCard'
import { parseAppLocale, type AppLocale } from '@/lib/i18n/locale'
import {
  DEFAULT_TEMPLATES,
  TEMPLATE_LABELS,
  TEMPLATE_VARIABLES,
  TEMPLATE_PREVIEW_VARS,
  type MessageTemplateType,
} from '@/lib/whatsapp/templates'

/**
 * Message templates settings page — owner only.
 * Per /docs/sprint-16-scope.md § Story 3.
 *
 * Templates are per-language: the ?lang tab picks which set is edited. The bot
 * resolves a recipient's language at send time, so both sets can be customised
 * independently.
 */

const ALL_TYPES = Object.keys(DEFAULT_TEMPLATES.he) as MessageTemplateType[]

const LANG_TABS: Array<{ locale: AppLocale; label: string }> = [
  { locale: 'he', label: 'עברית' },
  { locale: 'en', label: 'English' },
]

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

  const db = createServiceRoleClient()
  const { data: rows } = await db
    .from('message_templates')
    .select('type, body_template')
    .eq('organization_id', orgId)
    .eq('locale', locale)

  const customMap = new Map<string, string>(
    (rows ?? []).map(r => [r.type, r.body_template])
  )

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>
        <p className="text-sm text-gray-500 mt-1">
          התאם את הטקסט של כל הודעה שנשלחת אוטומטית דרך WhatsApp. שינויים ייכנסו לתוקף מיד.
          הבוט בוחר את השפה לפי השפה שבה ההורה כותב.
        </p>
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

      <div className="space-y-4">
        {ALL_TYPES.map(type => (
          <MessageTemplateCard
            key={`${locale}:${type}`}
            type={type}
            locale={locale}
            label={TEMPLATE_LABELS[type]}
            defaultBody={DEFAULT_TEMPLATES[locale][type]}
            customBody={customMap.get(type) ?? null}
            variables={TEMPLATE_VARIABLES[type]}
            previewVars={TEMPLATE_PREVIEW_VARS[type]}
          />
        ))}
      </div>
    </div>
  )
}
