'use client'

import { useState, useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { saveReceiptConfigAction, type ReceiptActionState } from './actions'
import type { ReceiptProviderType } from '@/lib/receipts/factory'

// Labels come from settings.receiptProviders.<value> — the picker renders in
// the viewer's language.
const PROVIDERS: ReceiptProviderType[] = ['green-invoice', 'icount', 'sumit']

const initialState: ReceiptActionState = { success: false }

const INPUT_CLS =
  'w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const LABEL_CLS = 'block text-sm font-medium text-gray-700 mb-1'

export function ReceiptSettingsForm() {
  const tp = useTranslations('settings')
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
            <option key={p} value={p}>
              {tp(`receiptProviders.${p}`)}
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
              placeholder={tp('receiptsForm.greenInvoiceIdPlaceholder')}
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
              placeholder={tp('receiptsForm.greenInvoiceSecretPlaceholder')}
              className={INPUT_CLS}
            />
          </div>
          <p className="text-xs text-gray-500">
            {tp('receiptsForm.greenPrefix')}
            <a
              href="https://app.greeninvoice.co.il"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              {tp('receiptsForm.greenLink')}
            </a>
            {tp('receiptsForm.greenSuffix')}
          </p>
        </>
      )}

      {/* iCount fields */}
      {provider === 'icount' && (
        <>
          <div>
            <label htmlFor="receipt-cid" className={LABEL_CLS}>
              {tp('receiptsForm.cidLabel')}
            </label>
            <input
              id="receipt-cid"
              name="cid"
              type="text"
              required
              autoComplete="off"
              placeholder={tp('receiptsForm.icountCidPlaceholder')}
              className={INPUT_CLS}
            />
          </div>
          <div>
            <label htmlFor="receipt-user" className={LABEL_CLS}>
              {tp('receiptsForm.userLabel')}
            </label>
            <input
              id="receipt-user"
              name="user"
              type="text"
              required
              autoComplete="off"
              placeholder={tp('receiptsForm.icountUserPlaceholder')}
              className={INPUT_CLS}
            />
          </div>
          <div>
            <label htmlFor="receipt-pass" className={LABEL_CLS}>
              {tp('receiptsForm.passLabel')}
            </label>
            <input
              id="receipt-pass"
              name="pass"
              type="password"
              required
              autoComplete="off"
              placeholder={tp('receiptsForm.icountPassPlaceholder')}
              className={INPUT_CLS}
            />
          </div>
          <p className="text-xs text-gray-500">
            {tp('receiptsForm.icountPrefix')}
            <a
              href="https://app.icount.co.il"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              iCount
            </a>
            {tp('receiptsForm.icountSuffix')}
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
              placeholder={tp('receiptsForm.sumitCompanyPlaceholder')}
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
              placeholder={tp('receiptsForm.sumitApiKeyPlaceholder')}
              className={INPUT_CLS}
            />
          </div>
          <p className="text-xs text-gray-500">
            {tp('receiptsForm.sumitPrefix')}
            <a
              href="https://app.sumit.co.il"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              Sumit
            </a>
            {tp('receiptsForm.sumitSuffix')}
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
