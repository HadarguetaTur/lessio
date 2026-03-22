'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

type ActionState = { error: string } | null
type FormAction = (prevState: ActionState, formData: FormData) => Promise<ActionState>

interface TeacherEditFormProps {
  action: FormAction
  defaultValues?: {
    bio?: string | null
  }
}

export function TeacherEditForm({ action, defaultValues }: TeacherEditFormProps) {
  const [state, formAction, pending] = useActionState(action, null)

  return (
    <form action={formAction} className="space-y-5 max-w-lg">
      {state?.error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 p-3 rounded-md">
          {state.error}
        </div>
      )}

      <div className="space-y-1">
        <label htmlFor="bio" className="block text-sm font-medium text-gray-700">
          ביוגרפיה
        </label>
        <textarea
          id="bio"
          name="bio"
          rows={4}
          defaultValue={defaultValues?.bio ?? ''}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
      </div>

      <div className="flex gap-3 pt-1">
        <Button type="submit" disabled={pending}>
          {pending ? 'שומר...' : 'שמירה'}
        </Button>
        <Link
          href="/teachers"
          className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
        >
          ביטול
        </Link>
      </div>
    </form>
  )
}
