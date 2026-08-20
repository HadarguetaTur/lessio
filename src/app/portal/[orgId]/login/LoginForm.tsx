'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { ArrowLeft } from 'lucide-react'
import { requestOtpAction, verifyOtpAction, type LoginState } from './actions'

const initialState: LoginState = { error: null }

// ── Phone step ────────────────────────────────────────────────────────────────

function PhoneStep({ orgId, orgName }: { orgId: string; orgName: string }) {
  const t = useTranslations('portal.login')
  const boundAction = requestOtpAction.bind(null, orgId)
  const [state, action, pending] = useActionState(boundAction, initialState)

  return (
    <div className="flex flex-col flex-1 justify-center px-6 py-10">
      <div className="mb-8 text-center">
        <h1 className="text-xl font-bold text-gray-900">{t('title')}</h1>
        <p className="text-sm text-gray-500 mt-1">{t('phoneSubtitle')}</p>
      </div>

      <form action={action} className="space-y-4">
        {state.error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3">
            {t(`errors.${state.error}`)}
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
            placeholder="05X-XXXXXXX"
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

        {/* The terms already say entering the portal is acceptance; this is
            where the parent actually gets to see that, plus the messaging
            consent the WhatsApp bot relies on. */}
        <p className="text-xs text-gray-500 leading-relaxed text-center">
          {t('legal.prefix')}
          <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
            {t('legal.terms')}
          </a>
          {t('legal.and')}
          <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
            {t('legal.privacy')}
          </a>
          {t('legal.suffix', { orgName })}
        </p>
      </form>
    </div>
  )
}

// ── OTP step ──────────────────────────────────────────────────────────────────

function OtpStep({ orgId, phone }: { orgId: string; phone: string }) {
  const t = useTranslations('portal.login')
  const boundAction = verifyOtpAction.bind(null, orgId, phone)
  const [state, action, pending] = useActionState(boundAction, initialState)

  return (
    <div className="flex flex-col flex-1 justify-center px-6 py-10">
      <div className="mb-8 text-center">
        <h1 className="text-xl font-bold text-gray-900">{t('otpTitle')}</h1>
        <p className="text-sm text-gray-500 mt-1">{t('otpSubtitle')}</p>
      </div>

      <form action={action} className="space-y-4">
        {state.error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3">
            {t(`errors.${state.error}`)}
          </div>
        )}

        <div className="space-y-1">
          <label htmlFor="otp" className="block text-sm font-medium text-gray-700">
            {t('otpLabel')}
          </label>
          <input
            id="otp"
            name="otp"
            type="text"
            inputMode="numeric"
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

        <a
          href={`/portal/${orgId}/login`}
          className="flex items-center justify-center gap-1 text-center text-sm text-gray-500 hover:text-gray-700"
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
    return <OtpStep orgId={orgId} phone={phone} />
  }
  return <PhoneStep orgId={orgId} orgName={orgName} />
}
