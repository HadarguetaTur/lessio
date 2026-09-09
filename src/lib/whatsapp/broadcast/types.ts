/**
 * Shared vocabulary of the broadcast engine.
 *
 * Kept in its own module because the audience resolver, the guard, the sender
 * and the screens all speak it, and two of those run in a browser bundle where
 * importing the service-role client would be a mistake.
 */

import type { AppLocale } from '@/lib/i18n/locale'

/** The three broadcast template types, as stored on broadcast_campaigns. */
export type BroadcastType = 'class_update' | 'promo' | 'group_invite'

/**
 * What a recipient's consent is measured against.
 *
 * `invite` shares the utility rules with `update` but has its own skip
 * behaviour (a parent already invited to a group is not invited twice).
 */
export type BroadcastCategory = 'update' | 'promo' | 'invite'

export function categoryOf(type: BroadcastType): BroadcastCategory {
  if (type === 'promo') return 'promo'
  if (type === 'group_invite') return 'invite'
  return 'update'
}

/**
 * The audience as a FILTER. Stored on the campaign and resolved to real people
 * only when the campaign starts, so a campaign scheduled for next week never
 * reaches a student who left in the meantime.
 */
export type AudienceFilter =
  | { kind: 'all_active' }
  | { kind: 'student_group'; groupId: string; onlyUninvited?: boolean }
  | { kind: 'lesson'; lessonId: string }
  | { kind: 'teacher'; teacherId: string }
  | { kind: 'open_debt' }
  | { kind: 'manual'; parentIds: string[] }

export type AudienceKind = AudienceFilter['kind']

/** Why a resolved person will not be messaged. Stored on broadcast_recipients. */
export type SkipReason =
  | 'opted_out'
  | 'updates_opted_out'
  | 'marketing_opted_out'
  | 'no_marketing_opt_in'
  | 'frequency_capped'
  | 'per_user_limit'
  | 'already_invited'
  | 'no_phone'
  | 'over_cap'

export interface BroadcastRecipient {
  parentId: string | null
  studentId: string | null
  phone: string
  displayName: string | null
  locale: AppLocale
}

export interface AudienceResult {
  included: BroadcastRecipient[]
  /** Grouped for the compose screen: "3 parents will be skipped — no marketing consent". */
  skipped: Array<{ reason: SkipReason; count: number }>
}

/** One person as the resolver reads them, before consent is applied. */
export interface AudienceCandidate {
  parentId: string | null
  studentId: string | null
  phone: string | null
  displayName: string | null
  locale: AppLocale | null
  isActive: boolean
  optedOutAt: string | null
  updatesOptedOutAt: string | null
  marketingOptInAt: string | null
  marketingOptedOutAt: string | null
  /** Only meaningful for a group invite: has this parent already been invited? */
  alreadyInvited?: boolean
}
