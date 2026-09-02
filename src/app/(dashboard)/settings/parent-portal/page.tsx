import { forbidden } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/auth/session'
import { getPortalSettings } from '@/lib/organizations/portalSettings'
import { PortalUrlCopy } from '@/components/dashboard/settings/PortalUrlCopy'
import { ParentPortalForm } from './ParentPortalForm'

/**
 * Parent-portal settings — what the org opens to parents in /portal/[orgId].
 * Owner/admin only.
 *
 * The portal link lives here rather than on the WhatsApp page: it is the
 * portal's address, and an owner sending it to parents wants to see, on the
 * same screen, what those parents will find behind it.
 */
export default async function ParentPortalSettingsPage() {
  const { orgId, role } = await getSession()

  if (role !== 'owner' && role !== 'admin') {
    forbidden()
  }

  const [t, settings] = await Promise.all([
    getTranslations('settings.parentPortal'),
    getPortalSettings(orgId),
  ])

  return (
    <div className="w-full max-w-xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">{t('title')}</h1>
      <p className="text-sm text-muted-foreground mb-8">{t('subtitle')}</p>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <ParentPortalForm settings={settings} />
      </div>

      <div className="mt-6 bg-white rounded-lg border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-1">{t('linkTitle')}</h2>
        <p className="text-xs text-muted-foreground mb-3">{t('linkHint')}</p>
        <PortalUrlCopy orgId={orgId} />
      </div>
    </div>
  )
}
