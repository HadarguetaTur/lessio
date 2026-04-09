'use client'

import { useState, useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { saveReceiptConfigAction, type ReceiptActionState } from './actions'
import type { ReceiptProviderType } from '@/lib/receipts/factory'

const PROVIDERS: Array<{ value: ReceiptProviderType; label: string }> = [
  { value: 'green-invoice', label: 'חשבוניות ירוקות (Morning)' },
  { value: 'icount',        label: 'iCount' },
  { value: 'sumit',         label: 'Sumit (סאמיט)' },
]

const initialState: ReceiptActionState = { success: false }

const INPUT_CLS =
  'w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const LABEL_CLS = 'block text-sm font-medium text-gray-700 mb-1'

export function ReceiptSettingsForm() {
  const t = useTranslations('settings.receipts')
  const tCommon = useTranslations('common')
  const [provider, setProvider] = useState<ReceiptProviderType>('green-invoice')
  const [state, formAction, isPending] = useActionState(saveReceiptConfigAction, initialState)

  return (
    <form action={formAction} className="space-y-4">
      {/* Provider selector */}
      <div>
        <label htmlFor="receipt-provider" className={LABEL_CLS}>
          {t('provider')}
        </label>
        <select
          id="receipt-provider"
          name="provider"
          value={provider}
          onChange={(e) => setProvider(e.target.value as ReceiptProviderType)}
          className={INPUT_CLS}
        >
          {PROVIDERS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {/* Green Invoice (Morning) fields */}
      {provider === 'green-invoice' && (
        <>
          <div>
            <label htmlFor="receipt-id" className={LABEL_CLS}>
              API ID
            </label>
            <input
              id="receipt-id"
              name="id"
              type="text"
              required
              autoComplete="off"
              placeholder="מזהה ה-API מלוח הבקרה של חשבוניות ירוקות"
              className={INPUT_CLS}
            />
          </div>
          <div>
            <label htmlFor="receipt-secret" className={LABEL_CLS}>
              Secret
            </label>
            <input
              id="receipt-secret"
              name="secret"
              type="password"
              required
              autoComplete="off"
              placeholder="הסיסמה הסודית מלוח הבקרה של חשבוניות ירוקות"
              className={INPUT_CLS}
            />
          </div>
          <p className="text-xs text-gray-500">
            ניתן למצוא את הפרטים בלוח הבקרה של{' '}
            <a
              href="https://app.greeninvoice.co.il"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              חשבוניות ירוקות
            </a>{' '}
            תחת הגדרות API.
          </p>
        </>
      )}

      {/* iCount fields */}
      {provider === 'icount' && (
        <>
          <div>
            <label htmlFor="receipt-cid" className={LABEL_CLS}>
              מזהה חברה (CID)
            </label>
            <input
              id="receipt-cid"
              name="cid"
              type="text"
              required
              autoComplete="off"
              placeholder="מזהה החברה ב-iCount"
              className={INPUT_CLS}
            />
          </div>
          <div>
            <label htmlFor="receipt-user" className={LABEL_CLS}>
              שם משתמש
            </label>
            <input
              id="receipt-user"
              name="user"
              type="text"
              required
              autoComplete="off"
              placeholder="שם המשתמש שלך ב-iCount"
              className={INPUT_CLS}
            />
          </div>
          <div>
            <label htmlFor="receipt-pass" className={LABEL_CLS}>
              סיסמה
            </label>
            <input
              id="receipt-pass"
              name="pass"
              type="password"
              required
              autoComplete="off"
              placeholder="הסיסמה שלך ב-iCount"
              className={INPUT_CLS}
            />
          </div>
          <p className="text-xs text-gray-500">
            השתמש בפרטי ההתחברות שלך ל-
            <a
              href="https://app.icount.co.il"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              iCount
            </a>
            . ה-CID מופיע בלוח הבקרה תחת הגדרות החברה.
          </p>
        </>
      )}

      {/* Sumit fields */}
      {provider === 'sumit' && (
        <>
          <div>
            <label htmlFor="receipt-company-id" className={LABEL_CLS}>
              Company ID
            </label>
            <input
              id="receipt-company-id"
              name="companyId"
              type="text"
              required
              autoComplete="off"
              placeholder="מזהה החברה ב-Sumit"
              className={INPUT_CLS}
            />
          </div>
          <div>
            <label htmlFor="receipt-api-key" className={LABEL_CLS}>
              API Key
            </label>
            <input
              id="receipt-api-key"
              name="apiKey"
              type="password"
              required
              autoComplete="off"
              placeholder="מפתח ה-API מהגדרות המפתח ב-Sumit"
              className={INPUT_CLS}
            />
          </div>
          <p className="text-xs text-gray-500">
            ניתן למצוא את הפרטים ב-
            <a
              href="https://app.sumit.co.il"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              Sumit
            </a>{' '}
            תחת הגדרות &rarr; API.
          </p>
        </>
      )}

      {state.error && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {isPending ? `${tCommon('actions.connect')}…` : tCommon('actions.connect')}
      </button>
    </form>
  )
}
