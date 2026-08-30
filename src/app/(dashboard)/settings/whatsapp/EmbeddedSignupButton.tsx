'use client'

/**
 * Meta Embedded Signup button (client component).
 *
 * Two independent signals have to meet before the server can be called, and
 * getting this wrong is the classic way the flow dies silently:
 *
 *   1. `FB.login`'s callback carries `response.authResponse.code` — the
 *      exchangeable code. Per Meta's implementation guide this is the *only*
 *      place the code ever appears, and it lives for 30 seconds.
 *   2. A `message` event from the popup carries the asset ids:
 *      { type: 'WA_EMBEDDED_SIGNUP', event: 'FINISH',
 *        data: { waba_id, phone_number_id, business_id } }
 *
 * Meta does not promise an order, so each half is stashed in a ref and whichever
 * lands second submits. One submit, one server round-trip, well inside the 30s.
 *
 * Embedded Signup v4: the version is fixed by the Facebook Login for Business
 * configuration behind `config_id`, not by anything passed here. `extras` must
 * therefore carry no `version`, `sessionInfoVersion`, `featureType` or
 * `features` — those are v2/v3 selectors and would pin the old flow.
 *
 * Every way the flow can end short — popup dismissed, permissions declined, a
 * WABA with no phone number, an error reported mid-flow — resolves to a visible
 * message. Nothing here fails to a console warning.
 *
 * https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/implementation/
 */

import { useEffect, useRef, useState, useCallback, useActionState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { META_API_VERSION } from '@/lib/whatsapp/graphVersion'
import { saveWhatsAppConnection, type WhatsAppActionResult } from './actions'

interface Props {
  metaAppId: string
  metaConfigId: string
}

const initialState: WhatsAppActionResult = { error: null }

/**
 * Meta posts from www., web. and business.facebook.com depending on the step.
 * Parsed rather than string-matched: a bare `endsWith('facebook.com')` would
 * also accept `notfacebook.com`.
 */
function isMetaOrigin(origin: string): boolean {
  try {
    const { protocol, hostname } = new URL(origin)
    return protocol === 'https:' && (hostname === 'facebook.com' || hostname.endsWith('.facebook.com'))
  } catch {
    return false
  }
}

/** `PHONE_NUMBER_SETUP` reads better as `phone number setup` inside a sentence. */
function readableStep(step: string): string {
  return step.toLowerCase().replace(/_/g, ' ')
}

export function EmbeddedSignupButton({ metaAppId, metaConfigId }: Props) {
  const router = useRouter()
  const tp = useTranslations('settings')
  const t = useTranslations('settings.whatsapp')
  const tCommon = useTranslations('common')

  const formRef = useRef<HTMLFormElement>(null)
  const [state, formAction, isPending] = useActionState(saveWhatsAppConnection, initialState)

  // The two halves of the signup result, plus a latch so a late-arriving second
  // half cannot submit the form twice.
  const codeRef = useRef<string | null>(null)
  const assetsRef = useRef<{ wabaId: string; phoneNumberId: string; businessId: string } | null>(null)
  const submittedRef = useRef(false)

  const [sdkReady, setSdkReady] = useState(false)
  const [clientError, setClientError] = useState<string | null>(null)
  const submittedToServerRef = useRef(false)

  useEffect(() => {
    if (isPending) submittedToServerRef.current = true
    if (!isPending && submittedToServerRef.current && !state.error) {
      submittedToServerRef.current = false
      router.refresh()
    }
  }, [isPending, state.error, router])

  const submitIfComplete = useCallback(() => {
    if (submittedRef.current) return
    const code = codeRef.current
    const assets = assetsRef.current
    if (!code || !assets) return

    const form = formRef.current
    if (!form) return

    submittedRef.current = true
    ;(form.querySelector('[name="phoneNumberId"]') as HTMLInputElement).value = assets.phoneNumberId
    ;(form.querySelector('[name="wabaId"]') as HTMLInputElement).value = assets.wabaId
    ;(form.querySelector('[name="businessId"]') as HTMLInputElement).value = assets.businessId
    ;(form.querySelector('[name="code"]') as HTMLInputElement).value = code
    form.requestSubmit()
  }, [])

  // ── Load and initialise the Meta JS SDK ─────────────────────────────────────
  useEffect(() => {
    // Already loaded by an earlier mount of this page. Deferred rather than set
    // inline: a synchronous setState in an effect body forces a second render
    // pass, and it would also diverge from the server render during hydration.
    if (window.FB) {
      queueMicrotask(() => setSdkReady(true))
      return
    }

    window.fbAsyncInit = () => {
      window.FB?.init({
        appId:            metaAppId,
        version:          META_API_VERSION,
        autoLogAppEvents: true,
        xfbml:            true,
      })
      setSdkReady(true)
    }

    // The script tag is here but the SDK has not finished loading — fbAsyncInit
    // above will still fire, so there is nothing to do but wait.
    if (document.getElementById('facebook-jssdk')) return

    const script = document.createElement('script')
    script.id = 'facebook-jssdk'
    script.src = 'https://connect.facebook.net/en_US/sdk.js'
    script.async = true
    script.defer = true
    script.crossOrigin = 'anonymous'
    script.onerror = () => setClientError(tp('whatsappPage.sdkNotLoaded'))
    document.body.appendChild(script)
  }, [metaAppId, tp])

  // ── Listen for the popup's Embedded Signup messages ─────────────────────────
  // Registered on its own, unconditionally: when the SDK is already loaded the
  // loader above returns early, and a listener attached inside it would be
  // skipped on every client-side navigation back to this page.
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!isMetaOrigin(event.origin)) return

      let payload: unknown
      try {
        payload = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
      } catch {
        return
      }

      const msg = payload as {
        type?: string
        event?: string
        data?: {
          phone_number_id?: string
          waba_id?: string
          business_id?: string
          current_step?: string
          error_message?: string
          error_code?: string | number
        }
      }

      if (msg?.type !== 'WA_EMBEDDED_SIGNUP') return

      const data = msg.data ?? {}

      // v4 reports a failure the user hit inside the flow as ERROR. Nothing was
      // created, so it ends the attempt the same way a reported CANCEL does.
      if (msg.event === 'ERROR') {
        console.error('[EmbeddedSignup] Meta reported an error', data)
        setClientError(
          data.error_message
            ? tp('whatsappPage.metaError', { message: data.error_message })
            : tp('whatsappPage.popupClosed')
        )
        return
      }

      // Meta reports plain abandonment and in-flow failures both as CANCEL —
      // the difference is whether error_message is set.
      if (msg.event === 'CANCEL') {
        if (data.error_message) {
          console.error('[EmbeddedSignup] Meta reported an error', data)
          setClientError(tp('whatsappPage.metaError', { message: data.error_message }))
        } else if (data.current_step) {
          setClientError(tp('whatsappPage.cancelledAtStep', { step: readableStep(data.current_step) }))
        } else {
          setClientError(tp('whatsappPage.popupClosed'))
        }
        return
      }

      // FINISH, FINISH_ONLY_WABA and FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING.
      if (!msg.event?.startsWith('FINISH')) return

      if (!data.waba_id) {
        console.error('[EmbeddedSignup] FINISH without a waba_id', data)
        setClientError(tp('whatsappPage.missingIds'))
        return
      }

      // FINISH_ONLY_WABA: the business created an account but never added a
      // number. There is nothing to send from, so this is not a connection.
      if (!data.phone_number_id) {
        setClientError(tp('whatsappPage.noPhoneNumber'))
        return
      }

      // business_id is documented as always present in v4, but nothing downstream
      // depends on it, so a missing value is recorded as empty rather than fatal.
      assetsRef.current = {
        wabaId:        data.waba_id,
        phoneNumberId: data.phone_number_id,
        businessId:    data.business_id ?? '',
      }
      submitIfComplete()
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [tp, submitIfComplete])

  function launchSignup() {
    setClientError(null)
    codeRef.current = null
    assetsRef.current = null
    submittedRef.current = false

    const FB = window.FB
    if (!FB) {
      setClientError(tp('whatsappPage.sdkNotLoaded'))
      return
    }

    FB.login(
      (response) => {
        const code = response?.authResponse?.code
        if (!code) {
          // No authResponse at all: the popup was dismissed or the permissions
          // were declined. Either way nothing was granted.
          setClientError(tp('whatsappPage.popupClosed'))
          return
        }

        codeRef.current = code
        submitIfComplete()

        // The callback is the terminal event, so if the asset ids never arrived
        // the flow is over and there is nothing left to wait for. The short
        // grace period only covers the callback beating the message event,
        // which Meta does not rule out.
        setTimeout(() => {
          if (!submittedRef.current && !assetsRef.current) {
            console.error('[EmbeddedSignup] Got a code but no asset ids')
            setClientError(tp('whatsappPage.missingIds'))
          }
        }, 2000)
      },
      {
        config_id:                      metaConfigId,
        response_type:                  'code',
        override_default_response_type: true,
        extras:                         { setup: {} },
      }
    )
  }

  const error = clientError ?? state.error

  return (
    <div>
      {/* Hidden form — populated and submitted programmatically on signup completion */}
      <form ref={formRef} action={formAction} className="hidden">
        <input type="hidden" name="phoneNumberId" defaultValue="" />
        <input type="hidden" name="wabaId" defaultValue="" />
        <input type="hidden" name="businessId" defaultValue="" />
        <input type="hidden" name="code" defaultValue="" />
      </form>

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      <button
        type="button"
        onClick={launchSignup}
        disabled={isPending || !sdkReady}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-green-700 text-white text-sm font-medium hover:bg-green-800 disabled:opacity-50 transition-colors"
      >
        {isPending ? `${tCommon('actions.connect')}…` : t('connect')}
      </button>

      <p className="text-xs text-muted-foreground mt-2">{tp('whatsappPage.signupHint')}</p>
    </div>
  )
}

// Augment Window for Meta SDK types
declare global {
  interface Window {
    FB?: {
      init: (opts: object) => void
      /**
       * The callback receives the login response — `authResponse.code` is the
       * exchangeable code, and it appears nowhere else.
       */
      login: (
        callback: (response: { authResponse?: { code?: string } | null; status?: string }) => void,
        opts: object
      ) => void
    }
    fbAsyncInit?: () => void
  }
}
