import { forbidden } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/auth/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { SchedulingForm } from './SchedulingForm'

/**
 * Scheduling settings — the business defaults behind slot generation.
 * Owner/admin only.
 */
export default async function SchedulingSettingsPage() {
  const { orgId, role } = await getSession()
  const t = await getTranslations('settings.scheduling')

  if (role !== 'owner' && role !== 'admin') {
    forbidden()
  }

  const db = createServiceRoleClient()

  const [{ data: org }, { count: teachersWithOwnBreak }] = await Promise.all([
    db
      .from('organizations')
      .select('break_duration_minutes, min_booking_notice_hours, tail_prompt_enabled')
      .eq('id', orgId)
      .single(),
    // A break set here is only a default; saying how many teachers have opted
    // out of it is what stops this screen from looking like it controls them.
    db
      .from('teachers')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .not('break_duration_minutes', 'is', null),
  ])

  const row = org as {
    break_duration_minutes: number | null
    min_booking_notice_hours: number | null
    tail_prompt_enabled: boolean | null
  } | null

  return (
    <div className="w-full max-w-xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">{t('title')}</h1>
      <p className="text-sm text-muted-foreground mb-8">{t('subtitle')}</p>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <SchedulingForm
          defaultBreakMinutes={row?.break_duration_minutes ?? 0}
          defaultNoticeHours={row?.min_booking_notice_hours ?? 0}
          defaultTailPromptEnabled={row?.tail_prompt_enabled ?? true}
          teachersWithOwnBreak={teachersWithOwnBreak ?? 0}
        />
      </div>
    </div>
  )
}
