'use client'

/**
 * Goals CRUD section for student profile.
 * Per /docs/sprint-24-scope.md § Story 4.
 */

import { useState, useTransition, useRef } from 'react'
import { Target, Plus, Trash2, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import type { StudentGoal } from '@/lib/goals'
import type { GoalActionState } from '@/app/(dashboard)/students/[id]/actions'

type Props = {
  goals: StudentGoal[]
  studentId: string
  createAction: (prev: GoalActionState, fd: FormData) => Promise<GoalActionState>
  updateStatusAction: (prev: GoalActionState, fd: FormData) => Promise<GoalActionState>
  deleteAction: (prev: GoalActionState, fd: FormData) => Promise<GoalActionState>
  canEdit: boolean
  onSuccess?: () => void
}

const STATUS_LABEL: Record<string, string> = {
  active: 'פעיל',
  achieved: 'הושג',
  abandoned: 'ננטש',
}
const STATUS_CLASS: Record<string, string> = {
  active: 'bg-blue-50 text-blue-700',
  achieved: 'bg-green-50 text-green-700',
  abandoned: 'bg-gray-100 text-gray-500',
}

export function GoalsSection({
  goals,
  studentId,
  createAction,
  updateStatusAction,
  deleteAction,
  canEdit,
  onSuccess,
}: Props) {
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)

  const activeGoals = goals.filter((g) => g.status === 'active')
  const pastGoals = goals.filter((g) => g.status !== 'active')

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      setError(null)
      const result = await createAction({ error: null }, fd)
      if (result.error) {
        setError(result.error)
      } else {
        setShowForm(false)
        formRef.current?.reset()
        onSuccess?.()
      }
    })
  }

  const handleStatusUpdate = (goalId: string, status: string) => {
    const fd = new FormData()
    fd.set('goalId', goalId)
    fd.set('studentId', studentId)
    fd.set('status', status)
    startTransition(async () => {
      setError(null)
      const result = await updateStatusAction({ error: null }, fd)
      if (result.error) setError(result.error)
      else onSuccess?.()
    })
  }

  const handleDelete = (goalId: string) => {
    const fd = new FormData()
    fd.set('goalId', goalId)
    fd.set('studentId', studentId)
    startTransition(async () => {
      setError(null)
      const result = await deleteAction({ error: null }, fd)
      if (result.error) setError(result.error)
      else onSuccess?.()
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
          <Target size={14} />
          יעדי למידה ({activeGoals.length} פעילים)
        </h3>
        {canEdit && (
          <button
            type="button"
            onClick={() => setShowForm(!showForm)}
            className="text-xs text-primary hover:underline flex items-center gap-1"
          >
            <Plus size={12} />
            יעד חדש
          </button>
        )}
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {/* Create form */}
      {showForm && canEdit && (
        <form ref={formRef} onSubmit={handleCreate} className="bg-gray-50 rounded-lg p-4 space-y-2">
          <input type="hidden" name="studentId" value={studentId} />
          <input
            name="subject"
            required
            placeholder="מקצוע (מתמטיקה, אנגלית...)"
            className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm"
          />
          <textarea
            name="description"
            required
            rows={2}
            placeholder="תיאור היעד..."
            className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm resize-none"
          />
          <input
            name="targetDate"
            type="date"
            className="border border-gray-200 rounded px-3 py-1.5 text-sm"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1"
            >
              {isPending && <Loader2 size={12} className="animate-spin" />}
              {isPending ? 'שומר...' : 'צור יעד'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="text-xs text-gray-500 hover:text-gray-700">
              ביטול
            </button>
          </div>
        </form>
      )}

      {/* Active goals */}
      {activeGoals.length === 0 && !showForm && (
        <p className="text-sm text-gray-400">אין יעדים פעילים.</p>
      )}

      {activeGoals.map((goal) => (
        <div key={goal.id} className="border border-gray-100 rounded-lg p-3 space-y-2 group">
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="text-xs font-medium text-gray-500">{goal.subject}</span>
              <p className="text-sm text-gray-800">{goal.description}</p>
              {goal.targetDate && (
                <p className="text-xs text-gray-400 mt-1">יעד: {goal.targetDate}</p>
              )}
            </div>
            {canEdit && (
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={() => handleStatusUpdate(goal.id, 'achieved')}
                  disabled={isPending}
                  title="סמן כהושג"
                  className="text-green-500 hover:text-green-700 p-1 disabled:opacity-50"
                >
                  <CheckCircle size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => handleStatusUpdate(goal.id, 'abandoned')}
                  disabled={isPending}
                  title="נטוש"
                  className="text-gray-400 hover:text-gray-600 p-1 disabled:opacity-50"
                >
                  <XCircle size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(goal.id)}
                  disabled={isPending}
                  title="מחק"
                  className="text-gray-400 hover:text-red-500 p-1 disabled:opacity-50"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )}
          </div>
        </div>
      ))}

      {/* Past goals */}
      {pastGoals.length > 0 && (
        <details className="text-sm">
          <summary className="text-gray-500 cursor-pointer hover:text-gray-700">
            יעדים שהושלמו / ננטשו ({pastGoals.length})
          </summary>
          <div className="mt-2 space-y-2">
            {pastGoals.map((goal) => (
              <div key={goal.id} className="border border-gray-50 rounded-lg p-3 opacity-60">
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-1.5 py-0.5 rounded ${STATUS_CLASS[goal.status]}`}>
                    {STATUS_LABEL[goal.status]}
                  </span>
                  <span className="text-xs text-gray-500">{goal.subject}</span>
                </div>
                <p className="text-sm text-gray-600 mt-1">{goal.description}</p>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
