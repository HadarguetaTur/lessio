'use client'

import { useActionState } from 'react'
import { signIn } from './actions'
import { Button } from '@/components/ui/button'

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, null)

  return (
    <form action={action} className="space-y-4">
      {state?.error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 p-3 rounded-md">
          {state.error}
        </div>
      )}

      <div className="space-y-1">
        <label htmlFor="email" className="block text-sm font-medium text-gray-700">
          אימייל
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="password" className="block text-sm font-medium text-gray-700">
          סיסמה
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'מתחבר...' : 'התחברות'}
      </Button>
    </form>
  )
}
