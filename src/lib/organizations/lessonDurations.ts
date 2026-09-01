import { createServiceRoleClient } from '@/lib/supabase/service-role'

export type LessonDurationAudience = 'bot' | 'teacher' | 'admin'

export interface LessonDurationSetting {
  minutes: number
  bot: boolean
  teacher: boolean
  admin: boolean
}

export const DEFAULT_LESSON_DURATIONS: LessonDurationSetting[] = [30, 45, 60, 90].map(
  (minutes) => ({ minutes, bot: true, teacher: true, admin: true })
)

export function normalizeLessonDurations(value: unknown): LessonDurationSetting[] {
  if (!Array.isArray(value)) return DEFAULT_LESSON_DURATIONS

  const unique = new Map<number, LessonDurationSetting>()
  for (const row of value) {
    if (!row || typeof row !== 'object') continue
    const item = row as Record<string, unknown>
    const minutes = Number(item.minutes)
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 480) continue
    unique.set(minutes, {
      minutes,
      bot: item.bot === true,
      teacher: item.teacher === true,
      admin: item.admin === true,
    })
  }

  return [...unique.values()].sort((a, b) => a.minutes - b.minutes)
}

export async function getOrgLessonDurations(
  orgId: string,
  audience?: LessonDurationAudience
): Promise<LessonDurationSetting[]> {
  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('organizations')
    .select('lesson_duration_settings')
    .eq('id', orgId)
    .single()

  if (error) throw new Error(`Failed to load lesson durations: ${error.message}`)
  const settings = normalizeLessonDurations(
    (data as Record<string, unknown> | null)?.lesson_duration_settings
  )
  return audience ? settings.filter((duration) => duration[audience]) : settings
}

export async function isLessonDurationAllowed(
  orgId: string,
  audience: LessonDurationAudience,
  minutes: number
): Promise<boolean> {
  const settings = await getOrgLessonDurations(orgId, audience)
  return settings.some((setting) => setting.minutes === minutes)
}
