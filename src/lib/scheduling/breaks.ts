/**
 * How long a teacher needs between two lessons.
 *
 * The setting lives at two levels, the way the Google Calendar connection does:
 * the organization sets a default every teacher follows, and a teacher who
 * needs something else overrides it for themselves.
 *
 * The break has two distinct effects, and only one of them existed before:
 *
 *   stride  — the spacing between generated slots (decisions.md #2,
 *             next_slot_start = slot_start + duration + break). Unchanged.
 *   buffer  — parent-facing slot generation keeps the break clear around
 *             lessons and active locks, so the bot can never hand out a slot
 *             that leaves the teacher no gap. A teacher or admin creating a
 *             lesson by hand is only warned; they may book back-to-back.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'

export interface EffectiveBreak {
  /** What to actually apply. */
  breakMinutes: number
  /** The organization default, for UI that explains where the value came from. */
  orgBreak: number
  /** NULL when the teacher has expressed no preference. */
  teacherBreak: number | null
}

/**
 * NULL on the teacher means "whatever the business says", so raising the org
 * default reaches everyone who never expressed a preference. An explicit 0
 * means "I teach back-to-back" and must survive the business changing its
 * default — which is why this is `??` and not `||`.
 */
export function resolveBreakMinutes(orgBreak: number, teacherBreak: number | null): number {
  return teacherBreak ?? orgBreak
}

/**
 * Reads both levels. Callers that already hold the two rows should use
 * `resolveBreakMinutes` directly rather than querying again.
 */
export async function getEffectiveBreakMinutes(
  organizationId: string,
  teacherId: string
): Promise<EffectiveBreak> {
  const db = createServiceRoleClient()

  const [orgResult, teacherResult] = await Promise.all([
    db
      .from('organizations')
      .select('break_duration_minutes')
      .eq('id', organizationId)
      .single(),
    db
      .from('teachers')
      .select('break_duration_minutes')
      .eq('id', teacherId)
      .eq('organization_id', organizationId)
      .maybeSingle(),
  ])

  const orgBreak = (orgResult.data?.break_duration_minutes as number | null) ?? 0
  const teacherBreak = (teacherResult.data?.break_duration_minutes as number | null) ?? null

  return {
    breakMinutes: resolveBreakMinutes(orgBreak, teacherBreak),
    orgBreak,
    teacherBreak,
  }
}

/** Why a break could not be saved, as a key both routes translate themselves. */
export type BreakMutationError =
  | { key: 'invalidBreak' }
  | { key: 'saveBreakFailed' }

/**
 * Parses the teacher break field and stores it.
 *
 * An empty field is the "follow the business default" case and stores NULL —
 * which is why this cannot use `Number(value) || null`: that would turn a
 * deliberate 0 into inheritance.
 */
export async function setTeacherBreakMinutes(
  organizationId: string,
  teacherId: string,
  rawValue: FormDataEntryValue | null
): Promise<BreakMutationError | null> {
  const trimmed = String(rawValue ?? '').trim()

  let value: number | null
  if (trimmed === '') {
    value = null
  } else {
    const parsed = Number(trimmed)
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 120) {
      return { key: 'invalidBreak' }
    }
    value = parsed
  }

  const db = createServiceRoleClient()
  const { error } = await db
    .from('teachers')
    .update({ break_duration_minutes: value, updated_at: new Date().toISOString() })
    .eq('id', teacherId)
    .eq('organization_id', organizationId)

  if (error) {
    console.error('[scheduling] Failed to save the teacher break', {
      organizationId,
      teacherId,
      error: error.message,
    })
    return { key: 'saveBreakFailed' }
  }

  return null
}
