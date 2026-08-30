'use client'

/**
 * Create-an-API-key form, plus the one-time reveal of the key it mints.
 *
 * The plaintext arrives in the action result and lives only in this component's
 * state. It is never re-fetched, so navigating away or reloading loses it for
 * good — which the reveal panel says plainly, because the alternative is an
 * owner who assumes they can come back for it later.
 */

import { useActionState, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Check, Copy, KeyRound, TriangleAlert } from 'lucide-react'
import { API_SCOPES, type ApiScope } from '@/lib/api/keys'
import { createApiKeyAction, type CreateApiKeyResult } from './actions'

const initialState: CreateApiKeyResult = { error: null }

/**
 * Scope ids carry a colon ("messages:send") and catalog paths are dot-split, so
 * the description keys use safe names rather than the raw scope id.
 */
const SCOPE_KEY: Record<ApiScope, 'read' | 'write' | 'messagesSend'> = {
  read: 'read',
  write: 'write',
  'messages:send': 'messagesSend',
}

export function CreateApiKeyForm() {
  const t = useTranslations('settings.integrations')
  const [state, formAction, isPending] = useActionState(createApiKeyAction, initialState)
  const formRef = useRef<HTMLFormElement>(null)

  // Clear the name and scope boxes once a key has been minted, so the next
  // create starts clean instead of re-submitting the same name.
  useEffect(() => {
    if (state.plaintext) formRef.current?.reset()
  }, [state.plaintext])

  return (
    <div className="space-y-4">
      {state.plaintext && (
        <RevealPanel plaintext={state.plaintext} name={state.name ?? ''} />
      )}

      <form ref={formRef} action={formAction} className="space-y-4">
        {state.error && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {state.error}
          </p>
        )}

        <div>
          <label htmlFor="name" className="mb-1 block text-sm font-medium text-gray-700">
            {t('form.nameLabel')}
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            maxLength={60}
            placeholder={t('form.namePlaceholder')}
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="mt-1 text-xs text-muted-foreground">{t('form.nameHint')}</p>
        </div>

        <fieldset>
          <legend className="mb-1 block text-sm font-medium text-gray-700">
            {t('form.scopesLabel')}
          </legend>
          <div className="space-y-2">
            {API_SCOPES.map((scope) => (
              <label key={scope} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  name="scopes"
                  value={scope}
                  defaultChecked={scope === 'read'}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300"
                />
                <span>
                  <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">{scope}</code>
                  <span className="ms-2 text-muted-foreground">
                    {t(`scopes.${SCOPE_KEY[scope]}`)}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
        >
          <KeyRound size={16} />
          {isPending ? `${t('form.submit')}…` : t('form.submit')}
        </button>
      </form>
    </div>
  )
}

function RevealPanel({ plaintext, name }: { plaintext: string; name: string }) {
  const t = useTranslations('settings.integrations')
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(plaintext)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard is blocked without a secure context or user permission. The
      // key is on screen and selectable, so this is not worth an error state.
    }
  }

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
      <div className="mb-2 flex items-center gap-2 text-amber-900">
        <TriangleAlert size={18} />
        <span className="text-sm font-semibold">{t('reveal.title', { name })}</span>
      </div>
      <p className="mb-3 text-sm text-amber-800">{t('reveal.warning')}</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 overflow-x-auto rounded border border-amber-200 bg-white px-3 py-2 font-mono text-xs text-gray-900">
          {plaintext}
        </code>
        <button
          type="button"
          onClick={copy}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-amber-300 bg-white px-3 py-2 text-sm text-amber-900 transition-colors hover:bg-amber-100"
        >
          {copied ? <Check size={15} /> : <Copy size={15} />}
          {copied ? t('reveal.copied') : t('reveal.copy')}
        </button>
      </div>
    </div>
  )
}
