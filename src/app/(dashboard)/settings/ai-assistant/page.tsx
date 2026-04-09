import { forbidden } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/auth/session'
import { isAiAssistantConfigured } from '@/lib/ai-assistant'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { AiAssistantForm } from './AiAssistantForm'
import { ConversationLogTable } from '@/components/dashboard/settings/ConversationLogTable'

/**
 * AI assistant settings page — owner only.
 * Toggle + last 50 conversation log entries.
 * Per /docs/sprint-19-scope.md § Story 3.
 */

export default async function AiAssistantSettingsPage() {
  const { orgId, role } = await getSession()
  const t = await getTranslations('settings.aiAssistant')
  const isConfigured = isAiAssistantConfigured()

  if (role !== 'owner') {
    forbidden()
  }

  const db = createServiceRoleClient()

  const [{ data: org }, { data: logs }] = await Promise.all([
    db
      .from('organizations')
      .select('ai_assistant_enabled')
      .eq('id', orgId)
      .single(),
    db
      .from('conversation_log')
      .select('id, phone, role, content, created_at')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  type LogRow = { id: string; phone: string; role: string; content: string; created_at: string }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">{t('title')}</h1>
      <p className="text-sm text-gray-500 mb-8">
        עוזר AI עונה להורים על שאלות נפוצות ישירות ב-WhatsApp בהתבסס על המידע בחשבון.
      </p>

      {/* Toggle */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-8">
        <AiAssistantForm
          defaultEnabled={org?.ai_assistant_enabled ?? false}
          isConfigured={isConfigured}
        />
      </div>

      {/* Conversation log */}
      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-3">{t('conversationLog')}</h2>
        <ConversationLogTable rows={(logs ?? []) as LogRow[]} />
      </div>
    </div>
  )
}
