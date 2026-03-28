import { forbidden } from 'next/navigation'
import { CheckCircle, AlertCircle } from 'lucide-react'
import { getSession } from '@/lib/auth/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getProviderUI } from '@/lib/payments/registry-ui'
import { PaymentProviderForm } from './PaymentProviderForm'
import { DisconnectPaymentButton } from './DisconnectPaymentButton'

/**
 * Payment provider settings page — owner only.
 * Per /docs/sprint-8-scope.md § Story 3.
 *
 * Reads connected provider from DB. Labels come from registry-ui — no hard-coded strings here.
 * To add a new provider: update registry-ui.ts + registry.ts only.
 */
export default async function PaymentSettingsPage() {
  const { orgId, role } = await getSession()

  if (role !== 'owner') {
    forbidden()
  }

  const db = createServiceRoleClient()
  const { data: org } = await db
    .from('organizations')
    .select('payment_provider')
    .eq('id', orgId)
    .single()

  const paymentProvider = org?.payment_provider ?? null
  const isConnected = Boolean(paymentProvider)
  const providerUI = paymentProvider ? getProviderUI(paymentProvider) : null

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">הגדרות תשלום</h1>
      <p className="text-sm text-gray-500 mb-8">
        חבר ספק תשלום כדי לשלוח קישורי תשלום אמיתיים להורים דרך WhatsApp.
        הפרטים מוצפנים ומאוחסנים בצורה מאובטחת.
      </p>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        {isConnected ? (
          <ConnectedState
            providerLabel={providerUI?.label ?? paymentProvider!}
            providerDescription={providerUI?.description}
          />
        ) : (
          <DisconnectedState />
        )}
      </div>

      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
        <p className="font-medium mb-1">אבטחה</p>
        <ul className="list-disc list-inside space-y-1 text-blue-700">
          <li>פרטי ה-API מוצפנים עם AES-256-GCM לפני האחסון</li>
          <li>הפרטים לעולם אינם נשמרים כטקסט גלוי במסד הנתונים</li>
          <li>כל ארגון מנהל ספק תשלום נפרד</li>
        </ul>
      </div>
    </div>
  )
}

function ConnectedState({
  providerLabel,
  providerDescription,
}: {
  providerLabel: string
  providerDescription?: string
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-green-700">
        <CheckCircle size={20} />
        <span className="font-medium text-sm">מחובר</span>
      </div>

      <dl className="text-sm space-y-2">
        <div className="flex justify-between">
          <dt className="text-gray-500">ספק תשלום</dt>
          <dd className="font-medium text-gray-900">{providerLabel}</dd>
        </div>
        {providerDescription && (
          <div className="flex justify-between">
            <dt className="text-gray-500">שירותים</dt>
            <dd className="text-gray-600 text-xs text-left max-w-[220px]">{providerDescription}</dd>
          </div>
        )}
        <div className="flex justify-between">
          <dt className="text-gray-500">פרטי API</dt>
          <dd className="text-gray-400 text-xs">מוצפנים ומאוחסנים בצורה מאובטחת</dd>
        </div>
      </dl>

      <hr className="border-gray-100" />

      <div>
        <p className="text-xs text-gray-500 mb-2">
          ניתוק יפסיק את יצירת קישורי תשלום עד לחיבור מחדש.
        </p>
        <DisconnectPaymentButton />
      </div>
    </div>
  )
}

function DisconnectedState() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-gray-500">
        <AlertCircle size={20} />
        <span className="font-medium text-sm">לא מחובר</span>
      </div>

      <p className="text-sm text-gray-600">
        בחר ספק תשלום והזן את פרטי ה-API. הפרטים יוצפנו לפני השמירה.
      </p>

      <PaymentProviderForm />
    </div>
  )
}
