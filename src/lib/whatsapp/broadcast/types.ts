/**
 * Shared vocabulary of the broadcast engine.
 *
 * Kept in its own module because the audience resolver, the guard, the sender
 * and the screens all speak it, and two of those run in a browser bundle where
 * importing the service-role client would be a mistake.
 */

import type { AppLocale } from '@/lib/i18n/locale'
import type { ConsentFacts } from '@/lib/whatsapp/consentRules'

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
  /** A saved, hand-picked list (broadcast_lists). Members are read at send time. */
  | { kind: 'list'; listId: string }

export type AudienceKind = AudienceFilter['kind']

/**
 * Why a resolved person will NOT be messaged — every value here is terminal.
 *
 * There is deliberately no reason for "past today's cap": that person is still
 * going to be messaged, just not today, and they are held as
 * `status = 'deferred'` instead. A skip reason that secretly meant "maybe later"
 * is how 350 of a 400-parent audience were quietly dropped.
 */
export type SkipReason =
  | 'opted_out'
  | 'updates_opted_out'
  | 'marketing_opted_out'
  | 'no_marketing_opt_in'
  | 'frequency_capped'
  | 'per_user_limit'
  | 'already_invited'
  | 'no_phone'

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

/**
 * One person as the resolver reads them, before consent is applied.
 *
 * It extends `ConsentFacts` rather than restating the four columns, so the
 * resolver and the send-time gate are typed against the same evidence.
 */
export interface AudienceCandidate extends ConsentFacts {
  parentId: string | null
  studentId: string | null
  phone: string | null
  displayName: string | null
  locale: AppLocale | null
  isActive: boolean
  /** Only meaningful for a group invite: has this parent already been invited? */
  alreadyInvited?: boolean
}
