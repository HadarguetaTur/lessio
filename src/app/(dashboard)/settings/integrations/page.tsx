import { forbidden } from 'next/navigation'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { CreditCard } from 'lucide-react'
import { getSession } from '@/lib/auth/session'
import { requireFeature } from '@/lib/saas/featureGate'
import { getShareableBaseUrl } from '@/lib/url/appUrl'
import { listApiKeys, listRecentApiRequests } from '@/lib/api/store'
import { PageHeader } from '@/components/ui/page-header'
import { CreateApiKeyForm } from './CreateApiKeyForm'
import { RevokeApiKeyButton } from './RevokeApiKeyButton'

/**
 * Integrations settings — owner only.
 * Per /docs/sprint-33-scope.md § M1.
 *
 * Issues the API keys that Make, n8n and MCP clients authenticate with, and
 * shows the recent request log so an owner can tell a misconfigured scenario
 * from a broken one without reading server logs.
 */
export default async function IntegrationsSettingsPage() {
  const { orgId, role } = await getSession()

  if (role !== 'owner') {
    forbidden()
  }

  // Outside any try/catch — requireFeature redirects.
  await requireFeature(orgId, 'integrations')

  const [keys, requests] = await Promise.all([
    listApiKeys(orgId),
    listRecentApiRequests(orgId),
  ])

  const t = await getTranslations('settings.integrations')
  const baseUrl = getShareableBaseUrl()

  return (
    <div className="max-w-3xl">
      <PageHeader title={t('pageTitle')} subtitle={t('pageSubtitle')} />

      {/* ── Keys ────────────────────────────────────────────────────────── */}
      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold text-gray-900">{t('keysTitle')}</h2>

        {keys.length === 0 ? (
          <p className="mb-6 text-sm text-muted-foreground">{t('keysEmpty')}</p>
        ) : (
          <div className="mb-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-start text-xs text-muted-foreground">
                  <th className="pb-2 text-start font-medium">{t('table.name')}</th>
                  <th className="pb-2 text-start font-medium">{t('table.key')}</th>
                  <th className="pb-2 text-start font-medium">{t('table.scopes')}</th>
                  <th className="pb-2 text-start font-medium">{t('table.lastUsed')}</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {keys.map((key) => (
                  <tr key={key.id} className="border-b border-gray-100 last:border-0">
                    <td className="py-2.5 font-medium text-gray-900">{key.name}</td>
                    <td className="py-2.5">
                      <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs">
                        {key.prefix}…
                      </code>
                    </td>
                    <td className="py-2.5 text-xs text-muted-foreground">
                      {key.scopes.join(', ')}
                    </td>
                    <td className="py-2.5 text-xs text-muted-foreground">
                      {key.lastUsedAt
                        ? new Date(key.lastUsedAt).toLocaleString()
                        : t('table.never')}
                    </td>
                    <td className="py-2.5 text-end">
                      <RevokeApiKeyButton keyId={key.id} name={key.name} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <CreateApiKeyForm />
      </section>

      {/* ── How to connect ──────────────────────────────────────────────── */}
      <section className="mt-6 rounded-lg border border-blue-200 bg-blue-50 p-5 text-sm text-blue-900">
        <h2 className="mb-2 font-semibold">{t('docs.title')}</h2>
        <dl className="space-y-2">
          <div>
            <dt className="text-xs text-blue-700">{t('docs.baseUrlLabel')}</dt>
            <dd>
              <code className="break-all font-mono text-xs">{baseUrl}/api/v1</code>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-blue-700">{t('docs.authLabel')}</dt>
            <dd>
              <code className="break-all font-mono text-xs">
                Authorization: Bearer lsk_live_…
              </code>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-blue-700">{t('docs.testLabel')}</dt>
            <dd>
              <code className="break-all font-mono text-xs">GET {baseUrl}/api/v1/me</code>
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-blue-800">{t('docs.rateLimit')}</p>

        <Link
          href="/settings/payment"
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-blue-800 underline underline-offset-2 hover:text-blue-950"
        >
          <CreditCard size={14} />
          {t('docs.paymentLink')}
        </Link>
      </section>

      {/* ── Recent activity ─────────────────────────────────────────────── */}
      <section className="mt-6 rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="mb-1 text-sm font-semibold text-gray-900">{t('activityTitle')}</h2>
        <p className="mb-4 text-xs text-muted-foreground">{t('activitySubtitle')}</p>

        {requests.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('activityEmpty')}</p>
        ) : (
          <ul className="space-y-1.5 font-mono text-xs">
            {requests.map((request) => (
              <li key={request.id} className="flex items-center gap-3">
                <span
                  className={
                    request.statusCode < 400
                      ? 'w-10 shrink-0 text-green-700'
                      : 'w-10 shrink-0 text-red-600'
                  }
                >
                  {request.statusCode}
                </span>
                <span className="w-12 shrink-0 text-muted-foreground">{request.method}</span>
                <span className="min-w-0 flex-1 truncate text-gray-700">{request.path}</span>
                <span className="shrink-0 text-muted-foreground">
                  {new Date(request.createdAt).toLocaleTimeString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
