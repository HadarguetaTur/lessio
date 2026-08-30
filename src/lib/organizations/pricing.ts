import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { DEFAULT_SUBSCRIPTION_COVERED_LESSON_TYPES } from '@/lib/billing/lessonPricing'
import type { LessonType } from '@/lib/lessons/types'

/** Fallbacks matching the DB column defaults, for rows written before the pricing migration. */
export const FALLBACK_PAIR_PRICE = 112.5
export const FALLBACK_GROUP_PRICE = 120

export interface OrgPricing {
  /** Org-wide default; teachers.hourly_rate overrides it when set. Null = unset. */
  individualHourlyRate: number | null
  pairPricePerStudent: number
  groupPricePerStudent: number
  /**
   * Lesson types an active subscription covers, so attendance in them is not
   * charged per lesson. Edited at /settings/billing-policy.
   */
  subscriptionCoveredLessonTypes: readonly LessonType[]
}

/**
 * The org's lesson pricing defaults, edited at /settings/pricing.
 *
 * Service role, like getOrgTimezone: this is called from the billing engine and
 * from cron paths where there is no Supabase Auth session. The org id is always
 * resolved server-side, never taken from the client.
 *
 * Custom lessons are absent by design — their price is required per lesson.
 */
export async function getOrgPricing(organizationId: string): Promise<OrgPricing> {
  const supabase = createServiceRoleClient()

  const { data } = await supabase
    .from('organizations')
    .select(
      'default_individual_hourly_rate, pair_price_per_student, group_price_per_student, subscription_covered_lesson_types'
    )
    .eq('id', organizationId)
    .single()

  return {
    individualHourlyRate: data?.default_individual_hourly_rate ?? null,
    pairPricePerStudent: data?.pair_price_per_student ?? FALLBACK_PAIR_PRICE,
    groupPricePerStudent: data?.group_price_per_student ?? FALLBACK_GROUP_PRICE,
    subscriptionCoveredLessonTypes:
      (data?.subscription_covered_lesson_types as LessonType[] | null) ??
      DEFAULT_SUBSCRIPTION_COVERED_LESSON_TYPES,
  }
}
