import { forbidden } from 'next/navigation'
import { CheckCircle, AlertCircle, Mail } from 'lucide-react'
import { getSession } from '@/lib/auth/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { DisconnectGmailButton } from './DisconnectGmailButton'
import { SendTestEmailForm } from './SendTestEmailForm'

/**
 * /settings/email — owner only.
 *
 * Allows the org to connect a Gmail account for outbound email.
 * Connected emails (receipts, homework, progress reports) are sent from
 * the org's own Gmail address instead of Lessio's platform Resend account.
 */
export default async function EmailSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>
}) {
  const { orgId, role } = await getSession()
  if (role !== 'owner') forbidden()

  const db = createServiceRoleClient()
  const { data: org } = await db
    .from('organizations')
    .select('gmail_connected_email')
    .eq('id', orgId)
    .single()

  const connectedEmail = org?.gmail_connected_email ?? null
  const isConnected = Boolean(connectedEmail)

  const params = await searchParams
  const justConnected = params.connected === '1'
  const errorCode = params.error ?? null

  const canConnect = Boolean(process.env.GOOGLE_CLIENT_ID)

  return (
    <div className="max-w-xl">
      <div className="flex items-center gap-3 mb-1">
        <Mail size={22} className="text-primary" />
        <h1 className="text-2xl font-bold text-gray-900">שליחת מייל מהחשבון שלך</h1>
      </div>
      <p className="text-sm text-gray-500 mb-8">
        חבר חשבון Gmail כדי ששליחות מיילים ללקוחותיך (קבלות, שיעורי בית, דוחות)
        יצאו מהכתובת שלך ולא מהכתובת של Lessio.
      </p>

      {justConnected && (
        <div className="mb-4 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
          חשבון Gmail חובר בהצלחה.
        </div>
      )}

      {errorCode && !justConnected && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
          {errorMessages[errorCode] ?? 'אירעה שגיאה בתהליך החיבור. נסה שנית.'}
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        {isConnected ? (
          <ConnectedState email={connectedEmail!} />
        ) : (
          <DisconnectedState canConnect={canConnect} />
        )}
      </div>

      <div className="mt-6 rounded-lg bg-blue-50 border border-blue-200 p-4 text-sm text-blue-800 space-y-1">
        <p className="font-medium">מה נשלח מהחשבון שלך לאחר החיבור?</p>
        <ul className="list-disc list-inside text-blue-700 space-y-0.5">
          <li>קבלות על תשלום</li>
          <li>עדכון ציון שיעורי בית</li>
          <li>דוחות התקדמות</li>
        </ul>
        <p className="text-blue-600 text-xs pt-1">
          מיילים של המערכת (איפוס סיסמה וכד׳) ממשיכים להישלח מ-Lessio.
        </p>
      </div>
    </div>
  )
}

function ConnectedState({ email }: { email: string }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-green-700">
        <CheckCircle size={20} />
        <span className="font-medium text-sm">מחובר</span>
      </div>

      <dl className="text-sm">
        <div className="flex justify-between">
          <dt className="text-gray-500">כתובת Gmail</dt>
          <dd className="font-mono text-gray-900 text-xs">{email}</dd>
        </div>
      </dl>

      <hr className="border-gray-100" />

      <SendTestEmailForm />

      <hr className="border-gray-100" />

      <div>
        <p className="text-xs text-gray-500 mb-2">
          ניתוק יגרום למיילים להישלח מחשבון Lessio המרכזי עד לחיבור מחדש.
        </p>
        <DisconnectGmailButton />
      </div>
    </div>
  )
}

function DisconnectedState({ canConnect }: { canConnect: boolean }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-gray-500">
        <AlertCircle size={20} />
        <span className="font-medium text-sm">לא מחובר</span>
      </div>

      <p className="text-sm text-gray-600">
        לחץ על הכפתור כדי להתחבר עם חשבון Google. תועבר לממשק Google לאישור הגישה.
      </p>

      {canConnect ? (
        <a
          href="/api/gmail/connect"
          className="inline-flex items-center gap-2 rounded-md bg-white border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
        >
          <GoogleIcon />
          התחבר עם Google
        </a>
      ) : (
        <p className="text-sm text-red-600">
          GOOGLE_CLIENT_ID אינו מוגדר בשרת — פנה למנהל המערכת.
        </p>
      )}
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  )
}

const errorMessages: Record<string, string> = {
  denied: 'לא אישרת את הגישה ל-Google. ניתן לנסות שנית.',
  invalid: 'קוד OAuth לא תקין. נסה שנית.',
  state_mismatch: 'בעיית אבטחה בתהליך ההתחברות. נסה שנית.',
  exchange: 'לא הצלחנו לאמת את הקוד מול Google. נסה שנית.',
  encrypt: 'שגיאה פנימית. פנה למנהל המערכת.',
  db: 'שגיאה בשמירת הנתונים. נסה שנית.',
  config: 'הגדרות Google חסרות בשרת. פנה למנהל המערכת.',
  forbidden: 'אין לך הרשאה לבצע פעולה זו.',
}
