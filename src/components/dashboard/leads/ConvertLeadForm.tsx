'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { convertLeadAction } from '@/app/(dashboard)/leads/[id]/convert/actions'

interface Props {
  leadId: string
  phone: string
}

export function ConvertLeadForm({ leadId, phone }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [parentFullName, setParentFullName] = useState('')
  const [studentFullName, setStudentFullName] = useState('')
  const [grade, setGrade] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await convertLeadAction(leadId, parentFullName, studentFullName, grade)
      if (result.error) {
        setError(result.error)
        return
      }
      router.push('/leads')
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-md">
      {/* Phone (read-only) */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">טלפון</label>
        <input
          type="text"
          value={phone}
          readOnly
          dir="ltr"
          className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm text-gray-500 bg-gray-50"
        />
      </div>

      {/* Parent full name */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          שם הורה <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={parentFullName}
          onChange={(e) => setParentFullName(e.target.value)}
          required
          placeholder="שם מלא של ההורה"
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        />
      </div>

      {/* Student full name */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          שם תלמיד <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={studentFullName}
          onChange={(e) => setStudentFullName(e.target.value)}
          required
          placeholder="שם מלא של התלמיד"
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        />
      </div>

      {/* Grade (optional) */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          כיתה <span className="text-gray-400 font-normal">(אופציונלי)</span>
        </label>
        <input
          type="text"
          value={grade}
          onChange={(e) => setGrade(e.target.value)}
          placeholder="לדוגמה: ז׳, ח׳, ט׳"
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        />
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? 'ממיר...' : 'המר לליד'}
        </button>
        <a
          href="/leads"
          className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
        >
          ביטול
        </a>
      </div>
    </form>
  )
}
