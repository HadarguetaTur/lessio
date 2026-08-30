'use client'

/**
 * Toggle for auto_send_payment_request org setting.
 * Submits immediately on change via a form action.
 * Per /docs/sprint-9-scope.md § Story 6.
 */

import { useActionState, useRef } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { saveAutoSendSetting, type PaymentActionResult } from './actions'

const initialState: PaymentActionResult = { error: null }

interface AutoSendToggleProps {
  defaultChecked: boolean
  /** A payment provider is stored — without one there is no link to send. */
  hasProvider: boolean
  /** A WhatsApp number is connected — without one there is no way to send it. */
  hasWhatsApp: boolean
}

/**
 * The requirements used to be a sentence under the checkbox. The audit ticked
 * this on for an org with no WhatsApp number, saved it, reloaded, and found it
 * still on — an automation that could never fire, with nothing on screen saying
 * so. The sentence is now derived from the two things it talks about.
 */
export function AutoSendToggle({
  defaultChecked,
  hasProvider,
  hasWhatsApp,
}: AutoSendToggleProps) {
  const tp = useTranslations('settings')
  const t = useTranslations('settings.payment')
  const tCommon = useTranslations('common')
  const [state, formAction, isPending] = useActionState(saveAutoSendSetting, initialState)
  const formRef = useRef<HTMLFormElement>(null)

  const blocked = !hasProvider || !hasWhatsApp

  function handleChange() {
    formRef.current?.requestSubmit()
  }

  return (
    <form ref={formRef} action={formAction}>
      <label
        className={`flex items-center gap-3 select-none ${
          blocked ? 'cursor-not-allowed' : 'cursor-pointer'
        }`}
      >
        <input
          type="checkbox"
          name="auto_send_payment_request"
          defaultChecked={defaultChecked}
          onChange={handleChange}
          disabled={isPending || blocked}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
        />
        <span className={`text-sm ${blocked ? 'text-muted-foreground' : 'text-gray-700'}`}>
          {t('autoSend')}
        </span>
        {isPending && (
          <span className="text-xs text-muted-foreground">{tCommon('actions.save')}…</span>
        )}
      </label>
      {state.error && (
        <p className="mt-2 text-xs text-red-600">{state.error}</p>
      )}
      {blocked ? (
        <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <p className="font-medium">{tp('autoSendToggle.blockedTitle')}</p>
          <ul className="mt-1.5 space-y-1">
            {!hasProvider && (
              <li>
                {tp('autoSendToggle.missingProvider')}{' '}
                <span className="text-amber-900">{tp('autoSendToggle.missingProviderHere')}</span>
              </li>
            )}
            {!hasWhatsApp && (
              <li>
                {tp('autoSendToggle.missingWhatsApp')}{' '}
                <Link
                  href="/settings/whatsapp"
                  className="font-medium underline underline-offset-2"
                >
                  {tp('autoSendToggle.missingWhatsAppLink')}
                </Link>
              </li>
            )}
          </ul>
        </div>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">{tp('autoSendToggle.hint')}</p>
      )}
    </form>
  )
}
