import type { StudentExam } from '@/lib/students/exams'
import { notifyExamReported } from '@/lib/exams/notify'
import { applyExamPolicy } from '@/lib/exams/policy'

/**
 * Completes the work triggered by a newly reported exam.
 *
 * Callers must either await this promise or register it with runAfterResponse.
 * The branches are isolated so notification delivery cannot prevent an
 * automatic quota change (or vice versa).
 */
export async function completeExamReportFollowUp(params: {
  orgId: string
  exam: StudentExam
}): Promise<void> {
  const { orgId, exam } = params

  await Promise.all([
    notifyExamReported({ orgId, exam }).catch((err) => {
      console.error('[exams/post-report] notification failed', { orgId, examId: exam.id, err })
    }),
    applyExamPolicy({ orgId, exam }).catch((err) => {
      console.error('[exams/post-report] policy failed', { orgId, examId: exam.id, err })
    }),
  ])
}
