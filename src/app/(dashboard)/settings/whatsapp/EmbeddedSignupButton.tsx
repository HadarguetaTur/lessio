'use client'

/**
 * Meta Embedded Signup button (client component).
 * Loads the Meta JS SDK, triggers the Embedded Signup popup, and calls the
 * server action once the flow completes.
 *
 * The Meta SDK sends a `message` event back to the page with:
 *   { type: 'WA_EMBEDDED_SIGNUP', event: 'FINISH', data: { phone_number_id, waba_id, code } }
 *
 * The component intercepts that event, submits a form to the server action
 * which exchanges the code for an access token and persists credentials.
 */

import { useEffect, useRef, useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { saveWhatsAppConnection, type WhatsAppActionResult } from './actions'

interface Props {
  metaAppId: string
}

const initialState: WhatsAppActionResult = { error: null }

export function EmbeddedSignupButton({ metaAppId }: Props) {
  const t = useTranslations('settings.whatsapp')
  const tCommon = useTranslations('common')
  const formRef = useRef<HTMLFormElement>(null)
  const [state, formAction, isPending] = useActionState(saveWhatsAppConnection, initialState)

  useEffect(() => {
    // Load the Meta JS SDK once
    if (document.getElementById('facebook-jssdk')) return

    const script = document.createElement('script')
    script.id = 'facebook-jssdk'
    script.src = 'https://connect.facebook.net/en_US/sdk.js'
    script.async = true
    script.defer = true
    script.crossOrigin = 'anonymous'
    document.body.appendChild(script)

    // Meta SDK calls FB.init when loaded
    window.fbAsyncInit = () => {
      window.FB?.init({
        appId:   metaAppId,
        version: 'v19.0',
        xfbml:   false,
        cookie:  false,
      })
    }

    // Listen for the Embedded Signup completion message
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== 'https://www.facebook.com' && event.origin !== 'https://web.facebook.com') return

      let data: unknown
      try {
        data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
      } catch {
        return
      }

      const msg = data as { type?: string; event?: string; data?: { phone_number_id?: string; waba_id?: string; code?: string } }

      if (msg.type === 'WA_EMBEDDED_SIGNUP' && msg.event === 'FINISH') {
        const phoneNumberId = msg.data?.phone_number_id
        const wabaId = msg.data?.waba_id ?? ''
        const code = msg.data?.code

        if (!phoneNumberId || !code) {
          console.warn('[EmbeddedSignup] Missing phone_number_id or code in callback', msg.data)
          return
        }

        // Populate hidden form inputs and submit to server action
        const form = formRef.current
        if (!form) return
        ;(form.querySelector('[name="phoneNumberId"]') as HTMLInputElement).value = phoneNumberId
        ;(form.querySelector('[name="wabaId"]') as HTMLInputElement).value = wabaId
        ;(form.querySelector('[name="code"]') as HTMLInputElement).value = code
        form.requestSubmit()
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [metaAppId])

  function launchSignup() {
    window.FB?.login(
      () => { /* OAuth handled via message event */ },
      {
        config_id: '',   // optional Business Config ID — leave empty to use default
        response_type: 'code',
        override_default_response_type: true,
        extras: { setup: {}, featurization: { messaging_product: 'whatsapp' } },
      }
    )
  }

  return (
    <div>
      {/* Hidden form — populated and submitted programmatically on signup completion */}
      <form ref={formRef} action={formAction} className="hidden">
        <input type="hidden" name="phoneNumberId" defaultValue="" />
        <input type="hidden" name="wabaId" defaultValue="" />
        <input type="hidden" name="code" defaultValue="" />
      </form>

      {state.error && (
        <p className="text-sm text-red-600 mb-3">{state.error}</p>
      )}

      <button
        type="button"
        onClick={launchSignup}
        disabled={isPending}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
      >
        {isPending ? `${tCommon('actions.connect')}…` : t('connect')}
      </button>

      <p className="text-xs text-gray-500 mt-2">
        תתחבר לחשבון Meta שלך ובחר את המספר שברצונך לחבר לארגון זה.
      </p>
    </div>
  )
}

// Augment Window for Meta SDK types
declare global {
  interface Window {
    FB?: {
      init: (opts: object) => void
      login: (callback: () => void, opts: object) => void
    }
    fbAsyncInit?: () => void
  }
}
