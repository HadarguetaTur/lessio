import { forbidden } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/auth/session'
import { isAiAssistantConfigured } from '@/lib/ai-assistant'
import { isAiConfiguredForOrg } from '@/lib/ai-assistant/providers/factory'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getUsageSummary } from '@/lib/ai-assistant/usage'
import { AiAssistantForm } from './AiAssistantForm'
import { AiProviderForm } from './AiProviderForm'
import { AiUsageTab } from '@/components/dashboard/settings/AiUsageTab'
import { ConversationLogTable } from '@/components/dashboard/settings/ConversationLogTable'
import { saveAiProviderAction, testAiConnectionAction } from './actions'
import type { AiProviderName } from '@/lib/ai-assistant/providers/types'

/**
 * AI assistant settings page — owner only.
 * Provider config + toggle + conversation log.
 * Per /docs/sprint-19-scope.md § Story 3 + /docs/sprint-25-scope.md § Story 1b.
 */

export default async function AiAssistantSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const { orgId, role } = await getSession()
  const t = await getTranslations('settings.aiAssistant')
  const params = await searchParams
  const activeTab = params.tab === 'usage' ? 'usage' : 'settings'

  if (role !== 'owner') {
    forbidden()
  }

  const currentMonth = new Date().toISOString().slice(0, 7) // YYYY-MM

  const db = createServiceRoleClient()

  const [{ data: org }, { data: logs }, isOrgConfigured, usageSummary] = await Promise.all([
    db
      .from('organizations')
      .select('ai_assistant_enabled, ai_provider, ai_model, ai_config_encrypted')
      .eq('id', orgId)
      .single(),
    db
      .from('conversation_log')
      .select('id, phone, role, content, created_at')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(50),
    isAiConfiguredForOrg(orgId),
    getUsageSummary(orgId, currentMonth),
  ])

  const isConfigured = isOrgConfigured || isAiAssistantConfigured()

  type LogRow = { id: string; phone: string; role: string; content: string; created_at: string }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">{t('title')}</h1>
      <p className="text-sm text-muted-foreground mb-6">
        {t('description')}
      </p>

      {/* Tab navigation */}
      <div className="flex gap-4 border-b border-gray-200 mb-8">
        <a
          href="?tab=settings"
          className={`pb-2 text-sm font-medium border-b-2 ${
            activeTab === 'settings'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-muted-foreground hover:text-gray-700'
          }`}
        >
          {t('tabSettings')}
        </a>
        <a
          href="?tab=usage"
          className={`pb-2 text-sm font-medium border-b-2 ${
            activeTab === 'usage'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-muted-foreground hover:text-gray-700'
          }`}
        >
          {t('tabUsage')}
        </a>
      </div>

      {activeTab === 'settings' ? (
        <>
          {/* Provider config — Sprint 25 */}
          <div className="bg-white rounded-lg border border-gray-200 p-6 mb-8">
            <AiProviderForm
              currentProvider={(org?.ai_provider ?? 'openai') as AiProviderName}
              currentModel={org?.ai_model ?? 'gpt-4o-mini'}
              hasEncryptedKey={Boolean(org?.ai_config_encrypted)}
              hasPlatformKey={isAiAssistantConfigured()}
              saveAction={saveAiProviderAction}
              testAction={testAiConnectionAction}
            />
          </div>

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
        </>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <AiUsageTab summary={usageSummary} month={currentMonth} />
        </div>
      )}
    </div>
  )
}
