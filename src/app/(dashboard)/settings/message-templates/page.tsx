import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/auth/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { MessageTemplateCard } from '@/components/dashboard/settings/MessageTemplateCard'
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
 * Loads all 14 template types; for each type shows the custom row if it
 * exists, otherwise shows the system default (greyed out).
 */

const ALL_TYPES: MessageTemplateType[] = [
  'booking_link',
  'booking_confirmation',
  'lesson_reminder',
  'payment_reminder',
  'payment_request',
  'cancellation_confirmation',
  'cancellation_admin_alert',
  'receipt_notification',
  'homework_assignment',
  'homework_reminder',
  'balance_reply',
  'schedule_reply',
  'portal_link_reply',
  'unknown_intent_fallback',
]

export default async function MessageTemplatesPage() {
  const { orgId, role } = await getSession()
  const t = await getTranslations('settings.messageTemplates')

  if (role !== 'owner') redirect('/settings')

  const db = createServiceRoleClient()
  const { data: rows } = await db
    .from('message_templates')
    .select('type, body_template')
    .eq('organization_id', orgId)

  const customMap = new Map<string, string>(
    (rows ?? []).map(r => [r.type, r.body_template])
  )

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>
        <p className="text-sm text-gray-500 mt-1">
          התאם את הטקסט של כל הודעה שנשלחת אוטומטית דרך WhatsApp. שינויים ייכנסו לתוקף מיד.
        </p>
      </div>

      <div className="space-y-4">
        {ALL_TYPES.map(type => (
          <MessageTemplateCard
            key={type}
            type={type}
            label={TEMPLATE_LABELS[type]}
            defaultBody={DEFAULT_TEMPLATES[type]}
            customBody={customMap.get(type) ?? null}
            variables={TEMPLATE_VARIABLES[type]}
            previewVars={TEMPLATE_PREVIEW_VARS[type]}
          />
        ))}
      </div>
    </div>
  )
}
