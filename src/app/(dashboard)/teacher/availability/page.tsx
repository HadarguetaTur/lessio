import { redirect } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { getSession } from '@/lib/auth/session'
import { getTeacherByProfileId } from '@/lib/teachers'
import { getTeacherAvailability, DAY_NAMES, AvailabilityWindow } from '@/lib/availability'
import { AddAvailabilityForm } from '@/components/dashboard/availability/AddAvailabilityForm'
import { addTeacherAvailability, deleteTeacherAvailability } from './actions'

function fmt(t: string) {
  return t.substring(0, 5)
}

export default async function TeacherAvailabilityPage() {
  const { userId, orgId, role } = await getSession()

  if (role !== 'teacher') {
    redirect('/dashboard')
  }

  const teacher = await getTeacherByProfileId(userId, orgId, { activeOnly: true })
  if (!teacher) {
    return (
      <div className="text-center mt-16 text-sm text-gray-500">
        לא נמצאה רשומת מורה פעילה. פנה למנהל המערכת.
      </div>
    )
  }

  const windows = await getTeacherAvailability(teacher.id, orgId)

  const byDay = new Map<number, AvailabilityWindow[]>()
  for (let d = 0; d <= 6; d++) byDay.set(d, [])
  windows.forEach((w) => byDay.get(w.day_of_week)!.push(w))

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">הזמינות שלי</h1>
      <p className="text-sm text-gray-500 mb-6">
        הגדר את החלונות השבועיים בהם תלמידים יוכלו להזמין שיעורים.
      </p>

      {/* Weekly grid */}
      <div className="space-y-2 mb-6">
        {Array.from(byDay.entries()).map(([day, dayWindows]) => (
          <div
            key={day}
            className="flex items-start gap-4 bg-white rounded-lg border border-gray-200 px-4 py-3"
          >
            <span className="w-16 shrink-0 text-sm font-medium text-gray-700 pt-0.5">
              {DAY_NAMES[day]}
            </span>

            {dayWindows.length === 0 ? (
              <span className="text-sm text-gray-300">—</span>
            ) : (
              <div className="flex flex-wrap gap-2">
                {dayWindows.map((w) => {
                  const deleteAction = deleteTeacherAvailability.bind(null, w.id)
                  return (
                    <div
                      key={w.id}
                      className="inline-flex items-center gap-2 bg-blue-50 text-blue-800 text-sm px-3 py-1 rounded-full"
                    >
                      <span dir="ltr" className="font-mono text-xs">
                        {fmt(w.start_time)}–{fmt(w.end_time)}
                      </span>
                      <form action={deleteAction} className="flex">
                        <button
                          type="submit"
                          className="text-blue-400 hover:text-red-500 transition-colors"
                          title="מחק חלון"
                        >
                          <Trash2 size={12} />
                        </button>
                      </form>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add window form */}
      <AddAvailabilityForm action={addTeacherAvailability} />
    </div>
  )
}
