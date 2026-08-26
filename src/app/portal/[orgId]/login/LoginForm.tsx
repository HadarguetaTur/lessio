'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { ArrowLeft } from 'lucide-react'
import { requestOtpAction, verifyOtpAction, type LoginState } from './actions'

const initialState: LoginState = { error: null }

// ── Phone step ────────────────────────────────────────────────────────────────

function PhoneStep({
  orgId,
  orgName,
  initialPhone,
}: {
  orgId: string
  orgName: string
  /** Carried back from the OTP step's "resend" link, so the number is already there. */
  initialPhone?: string
}) {
  const t = useTranslations('portal.login')
  const boundAction = requestOtpAction.bind(null, orgId)
  const [state, action, pending] = useActionState(boundAction, initialState)
  // Keyed on the error so a fresh failure re-seeds the inputs from the action's
  // echo rather than leaving React's own uncontrolled values in place.
  const formKey = `${state.error ?? 'ok'}:${state.phone ?? initialPhone ?? ''}`
  const phoneValue = state.phone ?? initialPhone ?? ''

  return (
    <div className="flex flex-col flex-1 justify-center px-6 py-10">
      <div className="mb-8 text-center">
        <h1 className="text-xl font-bold text-gray-900">{t('title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('phoneSubtitle')}</p>
      </div>

      <form action={action} className="space-y-4" key={formKey}>
        {state.error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-3">
            {t(`errors.${state.error}`, { org: orgName })}
          </div>
        )}

        <div className="space-y-1">
          <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
            {t('phoneLabel')}
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            placeholder="05X-XXXXXXX"
            defaultValue={phoneValue}
            required
            dir="ltr"
            className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        <button
          type="submit"
          disabled={pending}
          className="w-full py-2.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-40 transition-colors"
        >
          {pending ? t('sendingCode') : t('sendCode')}
        </button>

        {/* Explicit consent, as an action the parent takes rather than a
            footnote they scroll past: the terms, and the WhatsApp messages the
            bot will send them. Required on the client for the affordance and
            re-checked on the server in requestOtpAction, since a form can be
            posted without the browser. */}
        <label className="flex items-start gap-2.5 text-xs text-gray-600 leading-relaxed cursor-pointer">
          <input
            type="checkbox"
            name="consent"
            required
            defaultChecked={state.consent ?? false}
            className="mt-0.5 size-4 shrink-0 rounded border-gray-300 accent-blue-600"
          />
          <span>
            {t('legal.prefix')}
            <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
              {t('legal.terms')}
            </a>
            {t('legal.and')}
            <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
              {t('legal.privacy')}
            </a>
            {t('legal.suffix', { orgName })}
          </span>
        </label>
      </form>
    </div>
  )
}

// ── OTP step ──────────────────────────────────────────────────────────────────

function OtpStep({ orgId, phone, orgName }: { orgId: string; phone: string; orgName: string }) {
  const t = useTranslations('portal.login')
  const boundAction = verifyOtpAction.bind(null, orgId, phone)
  const [state, action, pending] = useActionState(boundAction, initialState)

  return (
    <div className="flex flex-col flex-1 justify-center px-6 py-10">
      <div className="mb-8 text-center">
        <h1 className="text-xl font-bold text-gray-900">{t('otpTitle')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('otpSubtitle')}</p>
      </div>

      <form action={action} className="space-y-4">
        {state.error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-3">
            {t(`errors.${state.error}`, { org: orgName })}
          </div>
        )}

        <div className="space-y-1">
          <label htmlFor="otp" className="block text-sm font-medium text-gray-700">
            {t('otpLabel')}
          </label>
          {/* autoComplete lets iOS and Android offer the code straight from the
              WhatsApp message; autoFocus saves aiming at the field. */}
          <input
            id="otp"
            name="otp"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            pattern="\d{6}"
            maxLength={6}
            placeholder="123456"
            required
            dir="ltr"
            className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm text-center tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        <button
          type="submit"
          disabled={pending}
          className="w-full py-2.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-40 transition-colors"
        >
          {pending ? t('verifying') : t('verify')}
        </button>

        {/* A code that never arrived, or expired, used to be a dead end: the
            only way on was back to step one and a full retype. */}
        <a
          href={`/portal/${orgId}/login?resend=1&phone=${encodeURIComponent(phone)}`}
          className="block text-center text-sm text-blue-600 hover:underline"
        >
          {t('resendCode')}
        </a>

        <a
          href={`/portal/${orgId}/login`}
          className="flex items-center justify-center gap-1 text-center text-sm text-muted-foreground hover:text-gray-700"
        >
          <ArrowLeft className="size-3.5 rtl:rotate-180" aria-hidden />
          {t('backToPhone')}
        </a>
      </form>
    </div>
  )
}

// ── Export ────────────────────────────────────────────────────────────────────

export function LoginForm({
  orgId,
  step,
  phone,
  orgName,
}: {
  orgId: string
  step?: string
  phone?: string
  orgName: string
}) {
  if (step === 'verify' && phone) {
    return <OtpStep orgId={orgId} phone={phone} orgName={orgName} />
  }
  return <PhoneStep orgId={orgId} orgName={orgName} initialPhone={phone} />
}
