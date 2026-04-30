'use client'

import { useActionState } from 'react'
import { requestOtpAction, verifyOtpAction, type LoginState } from './actions'

const initialState: LoginState = { error: null }

// ── Phone step ────────────────────────────────────────────────────────────────

function PhoneStep({ orgId }: { orgId: string }) {
  const boundAction = requestOtpAction.bind(null, orgId)
  const [state, action, pending] = useActionState(boundAction, initialState)

  return (
    <div className="flex flex-col flex-1 justify-center px-6 py-10">
      <div className="mb-8 text-center">
        <h1 className="text-xl font-bold text-gray-900">כניסה לפורטל</h1>
        <p className="text-sm text-gray-500 mt-1">הזן/י מספר הטלפון שלך ונשלח לך קוד אימות</p>
      </div>

      <form action={action} className="space-y-4">
        {state.error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3">
            {state.error}
          </div>
        )}

        <div className="space-y-1">
          <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
            מספר טלפון
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
          {pending ? 'שולח קוד...' : 'שלח קוד אימות'}
        </button>
      </form>
    </div>
  )
}

// ── OTP step ──────────────────────────────────────────────────────────────────

function OtpStep({ orgId, phone }: { orgId: string; phone: string }) {
  const boundAction = verifyOtpAction.bind(null, orgId, phone)
  const [state, action, pending] = useActionState(boundAction, initialState)

  return (
    <div className="flex flex-col flex-1 justify-center px-6 py-10">
      <div className="mb-8 text-center">
        <h1 className="text-xl font-bold text-gray-900">הזן/י קוד אימות</h1>
        <p className="text-sm text-gray-500 mt-1">
          שלחנו קוד 6 ספרות ל-WhatsApp שלך
        </p>
      </div>

      <form action={action} className="space-y-4">
        {state.error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3">
            {state.error}
          </div>
        )}

        <div className="space-y-1">
          <label htmlFor="otp" className="block text-sm font-medium text-gray-700">
            קוד אימות
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
          {pending ? 'מאמת...' : 'כניסה'}
        </button>

        <a
          href={`/portal/${orgId}/login`}
          className="block text-center text-sm text-gray-500 hover:text-gray-700"
        >
          חזרה ← הזן/י מספר שוב
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
}: {
  orgId: string
  step?: string
  phone?: string
}) {
  if (step === 'verify' && phone) {
    return <OtpStep orgId={orgId} phone={phone} />
  }
  return <PhoneStep orgId={orgId} />
}
