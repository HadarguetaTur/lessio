import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/auth/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { CalendarSubscribeSection } from '@/components/dashboard/CalendarSubscribeSection'
import { CalendarDays } from 'lucide-react'

/**
 * Teacher calendar subscription page.
 * Provides the iCal URL and token management.
 * Per /docs/sprint-16-scope.md § Story 4.
 */
export default async function TeacherCalendarPage() {
  const { userId, orgId, role } = await getSession()
  const t = await getTranslations('teacherSelf.calendar')

  if (role !== 'teacher') redirect('/dashboard')

  const db = createServiceRoleClient()

  // Load teacher record including ical_token
  const { data: teacher, error } = await db
    .from('teachers')
    .select('id, ical_token')
    .eq('profile_id', userId)
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .maybeSingle()

  if (error || !teacher) {
    return (
      <div className="text-center mt-16 text-sm text-gray-500">
        {t('noTeacherRecordContact')}
      </div>
    )
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const icalUrl = `${appUrl}/api/calendar/${teacher.ical_token}`

  return (
    <div className="max-w-xl space-y-6">
      <div className="flex items-center gap-3">
        <CalendarDays size={24} className="text-blue-600 shrink-0" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {t('description')}
          </p>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <CalendarSubscribeSection icalUrl={icalUrl} />
      </div>
    </div>
  )
}
