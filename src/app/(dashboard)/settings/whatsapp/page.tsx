import { forbidden } from 'next/navigation'
import { CheckCircle, AlertCircle } from 'lucide-react'
import { getSession } from '@/lib/auth/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { EmbeddedSignupButton } from './EmbeddedSignupButton'
import { DisconnectButton } from './DisconnectButton'
import { PortalUrlCopy } from '@/components/dashboard/settings/PortalUrlCopy'
import { getTranslations } from 'next-intl/server'

/**
 * WhatsApp Settings page — owner only.
 * Per /docs/sprint-7-scope.md § Story 3.
 *
 * Connected state:   shows the connected phone_number_id + Disconnect button.
 * Disconnected state: shows the Meta Embedded Signup button to connect a number.
 */
export default async function WhatsAppSettingsPage() {
  const { orgId, role } = await getSession()

  if (role !== 'owner') {
    forbidden()
  }

  const db = createServiceRoleClient()
  const { data: org } = await db
    .from('organizations')
    .select('id, whatsapp_phone_number_id')
    .eq('id', orgId)
    .single()

  const phoneNumberId = org?.whatsapp_phone_number_id ?? null
  const isConnected = Boolean(phoneNumberId)

  const metaAppId = process.env.META_APP_ID ?? ''

  const t = await getTranslations('settings')

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">{t('whatsapp.title')}</h1>
      <p className="text-sm text-gray-500 mb-8">
        חבר את מספר ה-WhatsApp של הארגון שלך כדי לשלוח ולקבל הודעות.
        כל ארגון מחובר למספר משלו.
      </p>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        {isConnected ? (
          <ConnectedState phoneNumberId={phoneNumberId!} connectedLabel={t('whatsapp.connected')} />
        ) : (
          <DisconnectedState metaAppId={metaAppId} />
        )}
      </div>

      {/* Portal URL — shown when WhatsApp is connected */}
      {isConnected && org?.id && (
        <div className="mt-6 bg-white rounded-lg border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-1">{t('whatsapp.portalUrl')}</h2>
          <p className="text-xs text-gray-500 mb-3">
            שתף/י קישור זה עם ההורים כדי שיוכלו לגשת לפורטל האישי שלהם.
          </p>
          <PortalUrlCopy orgId={org.id} />
        </div>
      )}

      <div className="mt-6 bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
        <p className="font-medium mb-1">דרישות לחיבור</p>
        <ul className="list-disc list-inside space-y-1 text-amber-700">
          <li>חשבון Meta Business עם גישה ל-WhatsApp Business API</li>
          <li>מספר טלפון שאינו רשום כבר ב-WhatsApp</li>
          <li>אימות עסקי ב-Meta (Meta Business Verification)</li>
        </ul>
      </div>
    </div>
  )
}

function ConnectedState({ phoneNumberId, connectedLabel }: { phoneNumberId: string; connectedLabel: string }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-green-700">
        <CheckCircle size={20} />
        <span className="font-medium text-sm">{connectedLabel}</span>
      </div>

      <dl className="text-sm space-y-2">
        <div className="flex justify-between">
          <dt className="text-gray-500">Phone Number ID</dt>
          <dd className="font-mono text-gray-900 text-xs">{phoneNumberId}</dd>
        </div>
      </dl>

      <hr className="border-gray-100" />

      <div>
        <p className="text-xs text-gray-500 mb-2">
          ניתוק יפסיק את קבלת ושליחת הודעות WhatsApp עד לחיבור מחדש.
        </p>
        <DisconnectButton />
      </div>
    </div>
  )
}

function DisconnectedState({ metaAppId }: { metaAppId: string }) {
  const canConnect = Boolean(metaAppId)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-gray-500">
        <AlertCircle size={20} />
        <span className="font-medium text-sm">לא מחובר</span>
      </div>

      <p className="text-sm text-gray-600">
        לחץ על הכפתור להתחלת תהליך החיבור דרך Meta.
        תועבר לממשק של Meta לבחירת המספר שברצונך לחבר.
      </p>

      {canConnect ? (
        <EmbeddedSignupButton metaAppId={metaAppId} />
      ) : (
        <p className="text-sm text-red-600">
          META_APP_ID אינו מוגדר בשרת — לא ניתן להתחיל תהליך חיבור.
        </p>
      )}
    </div>
  )
}
