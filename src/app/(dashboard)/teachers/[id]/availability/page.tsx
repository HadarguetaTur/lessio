import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowRight, Trash2 } from 'lucide-react'
import { getSession } from '@/lib/auth/session'
import { getTeacherById } from '@/lib/teachers'
import { getTeacherAvailability, DAY_NAMES, AvailabilityWindow } from '@/lib/availability'
import { AddAvailabilityForm } from '@/components/dashboard/availability/AddAvailabilityForm'
import { createAvailability, deleteAvailability } from './actions'

/** Format Postgres time "HH:MM:SS" to "HH:MM" for display */
function fmt(t: string) {
  return t.substring(0, 5)
}

export default async function TeacherAvailabilityPage(props: {
  params: Promise<{ id: string }>
}) {
  const { id } = await props.params
  const { orgId } = await getSession()

  const teacher = await getTeacherById(id, orgId)
  if (!teacher) notFound()

  const windows = await getTeacherAvailability(id, orgId)

  // Group by day_of_week
  const byDay = new Map<number, AvailabilityWindow[]>()
  for (let d = 0; d <= 6; d++) byDay.set(d, [])
  windows.forEach((w) => byDay.get(w.day_of_week)!.push(w))

  const boundCreate = createAvailability.bind(null, id)

  return (
    <div className="max-w-2xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-6 text-sm text-gray-500">
        <Link href="/teachers" className="hover:text-gray-700">
          מורים
        </Link>
        <ArrowRight size={14} className="rotate-180" />
        <span className="text-gray-900 font-medium">{teacher.profile.full_name}</span>
        <ArrowRight size={14} className="rotate-180" />
        <span>זמינות</span>
      </div>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        זמינות שבועית — {teacher.profile.full_name}
      </h1>

      {/* Nav */}
      <div className="flex gap-3 mb-6 text-sm">
        <span className="font-medium text-gray-900">זמינות שבועית</span>
        <span className="text-gray-300">|</span>
        <Link
          href={`/teachers/${id}/overrides`}
          className="text-gray-500 hover:text-gray-800"
        >
          חריגים לתאריך ספציפי
        </Link>
      </div>

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
                  const deleteAction = deleteAvailability.bind(null, w.id, id)
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
      <AddAvailabilityForm action={boundCreate} />
    </div>
  )
}
