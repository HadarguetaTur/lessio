/**
 * A parent cancelling their own lesson — the WhatsApp bot and the parent portal.
 *
 * A thin adapter over `cancelLessonCore`, which owns the whole cancellation
 * rule. This file used to own a second copy of it, and the copy differed: it
 * billed whoever tapped cancel instead of the student's primary parent, covered
 * only the first student of a group lesson, wrote no record at all in
 * monthly-billing orgs, and returned a fee to quote the family that it had not
 * necessarily charged.
 *
 * `chargeResult` is now what was actually billed. Callers must render the
 * family's confirmation from it and nothing else.
 */

import {
  cancelLessonCore,
  type CancellationLine,
  type CancellationSource as CoreSource,
} from './cancelLessonCore'
import type { CancellationChargeResult } from '@/lib/billing/calculateCancellationCharge'

export type CancellationError = 'already_cancelled' | 'not_eligible' | 'not_found'

/** Where the cancellation came from — recorded on the lesson. */
export type CancellationSource = 'whatsapp' | 'portal'

export interface ExecuteCancellationResult {
  success: true
  lessonStartAt: string
  studentName: string
  teacherName: string
  /** What the family was actually charged. Zero is zero — never quote around it. */
  chargeResult: CancellationChargeResult
  /**
   * A fee recorded against the org's monthly bill instead of charged now. It
   * still needs an admin's confirmation, so it is not something to bill the
   * family for in the confirmation message.
   */
  pendingTotal: number
  lines: CancellationLine[]
}

export interface ExecuteCancellationFailure {
  success: false
  error: CancellationError
}

export type ExecuteCancellationOutcome = ExecuteCancellationResult | ExecuteCancellationFailure

export async function executeCancellation(
  lessonId: string,
  parentId: string,
  orgId: string,
  source: CancellationSource = 'whatsapp'
): Promise<ExecuteCancellationOutcome> {
  const outcome = await cancelLessonCore({
    lessonId,
    orgId,
    actor: { kind: 'parent', parentId },
    source: source as CoreSource,
  })

  if (!outcome.success) {
    // The core distinguishes more failures than a parent-facing surface needs.
    // 'already_delivered', 'forbidden' and 'no_students' all mean the same thing
    // to a parent: this is not yours to cancel any more.
    const error: CancellationError =
      outcome.error === 'not_found'
        ? 'not_found'
        : outcome.error === 'already_cancelled'
          ? 'already_cancelled'
          : 'not_eligible'
    return { success: false, error }
  }

  return {
    success: true,
    lessonStartAt: outcome.lessonStartAt,
    studentName: outcome.studentName,
    teacherName: outcome.teacherName,
    chargeResult: outcome.chargeResult,
    pendingTotal: outcome.pendingTotal,
    lines: outcome.lines,
  }
}
