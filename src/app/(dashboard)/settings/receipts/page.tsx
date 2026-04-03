import { forbidden } from 'next/navigation'
import { CheckCircle, AlertCircle } from 'lucide-react'
import { getSession } from '@/lib/auth/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { RECEIPT_PROVIDER_LABELS, type ReceiptProviderType } from '@/lib/receipts/factory'
import { ReceiptSettingsForm } from './ReceiptSettingsForm'
import { DisconnectReceiptButton } from './DisconnectReceiptButton'

/**
 * Receipt provider settings page — owner only.
 *
 * Supports Green Invoice (Morning), iCount, and Sumit.
 * Credentials are AES-256-GCM encrypted and never displayed.
 * The receipt_provider column is plaintext for display without decryption.
 */
export default async function ReceiptSettingsPage() {
  const { orgId, role } = await getSession()

  if (role !== 'owner') {
    forbidden()
  }

  const db = createServiceRoleClient()
  const { data: org } = await db
    .from('organizations')
    .select('receipt_config_encrypted, receipt_provider')
    .eq('id', orgId)
    .single()

  const isConnected = Boolean(org?.receipt_config_encrypted)
  const providerType = (org?.receipt_provider ?? 'green-invoice') as ReceiptProviderType
  const providerLabel = RECEIPT_PROVIDER_LABELS[providerType] ?? providerType

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">קבלות</h1>
      <p className="text-sm text-gray-500 mb-8">
        חבר את מערכת החשבוניות שלך כדי להפיק קבלה אוטומטית לכל תשלום ולשלוח אותה להורה ב-WhatsApp.
        הפרטים מוצפנים ומאוחסנים בצורה מאובטחת.
      </p>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        {isConnected
          ? <ConnectedState providerLabel={providerLabel} />
          : <DisconnectedState />}
      </div>

      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
        <p className="font-medium mb-1">אבטחה</p>
        <ul className="list-disc list-inside space-y-1 text-blue-700">
          <li>פרטי ה-API מוצפנים עם AES-256-GCM לפני האחסון</li>
          <li>הפרטים לעולם אינם נשמרים כטקסט גלוי במסד הנתונים</li>
          <li>כל ארגון מנהל חיבור נפרד לספק הקבלות</li>
        </ul>
      </div>
    </div>
  )
}

function ConnectedState({ providerLabel }: { providerLabel: string }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-green-700">
        <CheckCircle size={20} />
        <span className="font-medium text-sm">מחובר — {providerLabel}</span>
      </div>

      <dl className="text-sm space-y-2">
        <div className="flex justify-between">
          <dt className="text-gray-500">ספק קבלות</dt>
          <dd className="font-medium text-gray-900">{providerLabel}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-gray-500">פרטי API</dt>
          <dd className="text-gray-400 text-xs">מוצפנים ומאוחסנים בצורה מאובטחת</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-gray-500">הפקה אוטומטית</dt>
          <dd className="text-gray-600 text-xs">בכל סימון «שולם» או קבלת תשלום מקוון</dd>
        </div>
      </dl>

      <hr className="border-gray-100" />

      <div>
        <p className="text-xs text-gray-500 mb-2">
          ניתוק יפסיק את הפקת הקבלות עד לחיבור מחדש.
        </p>
        <DisconnectReceiptButton />
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
        בחר ספק קבלות, הזן את פרטי ה-API שלו, ולחץ שמור וחבר.
        הפרטים יאומתו ויוצפנו לפני השמירה.
      </p>

      <ReceiptSettingsForm />
    </div>
  )
}
