/**
 * The punch-card ledger (decision #46). Every write to `lesson_pack_ledger`
 * goes through here; the balance is never stored, only summed.
 *
 * Service role: called from the completion reconciler, the cancellation core,
 * the payment webhook and owner actions — none of which may depend on RLS.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { PackConsumeKind } from '@/lib/billing/outcome/priceOutcome'

export const CONSUME_KINDS: readonly PackConsumeKind[] = ['consume_lesson', 'consume_late_cancel', 'consume_no_show']

export type ConsumeResult = {
  outcome: 'consumed' | 'already' | 'none'
  packId: string | null
  remaining: number
  kind: PackConsumeKind | null
}

/**
 * Takes one credit for (lesson, student) from the best eligible pack, in one
 * serialised database decision (`consume_pack_credit`). Idempotent: a second
 * call for the same pair reports 'already' and writes nothing.
 */
export async function consumePackCredit(params: {
  organizationId: string
  studentId: string
  lessonId: string
  lessonType: string
  /** YYYY-MM-DD in the org's timezone — validity is a calendar question. */
  lessonDate: string
  kind: PackConsumeKind
}): Promise<ConsumeResult> {
  const db = createServiceRoleClient()
  const { data, error } = await db.rpc('consume_pack_credit', {
    p_org: params.organizationId,
    p_student: params.studentId,
    p_lesson: params.lessonId,
    p_lesson_type: params.lessonType,
    p_lesson_date: params.lessonDate,
    p_kind: params.kind,
  })
  // Throw rather than read "none": billing money because the punch lookup
  // broke would charge a family that already paid for this lesson.
  if (error) throw new Error(`[packs] consume_pack_credit failed: ${error.message}`)

  const row = (Array.isArray(data) ? data[0] : data) as
    | { consumed_pack_id: string | null; remaining_credits: number | null; outcome: string; consumed_kind: string | null }
    | undefined
  const outcome = row?.outcome === 'consumed' || row?.outcome === 'already' ? row.outcome : 'none'
  return {
    outcome,
    packId: row?.consumed_pack_id ?? null,
    remaining: Number(row?.remaining_credits ?? 0),
    kind: (row?.consumed_kind as PackConsumeKind | null) ?? null,
  }
}

export interface LessonPackUse {
  id: string
  pack_id: string
  student_id: string | null
  kind: PackConsumeKind
}

/** The live (un-reversed) punches on one lesson. */
export async function loadLessonPackUses(organizationId: string, lessonId: string): Promise<LessonPackUse[]> {
  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('lesson_pack_ledger')
    .select('id, pack_id, student_id, kind')
    .eq('organization_id', organizationId)
    .eq('lesson_id', lessonId)
    .is('reversed_at', null)
    .in('kind', CONSUME_KINDS as string[])
  if (error) throw new Error(`[packs] lesson uses read failed: ${error.message}`)
  return (data ?? []) as LessonPackUse[]
}

/** Undoes punches by marking them reversed. The credit returns to its pack. */
export async function reverseLedgerEntries(
  organizationId: string,
  entryIds: readonly string[],
  reason: string
): Promise<void> {
  if (entryIds.length === 0) return
  const db = createServiceRoleClient()
  const { error } = await db
    .from('lesson_pack_ledger')
    .update({ reversed_at: new Date().toISOString(), reversed_reason: reason })
    .eq('organization_id', organizationId)
    .in('id', entryIds as string[])
    .is('reversed_at', null)
  if (error) throw new Error(`[packs] reversal failed: ${error.message}`)
}
