import { describe, expect, it, vi } from 'vitest'

const { mockCreateExamReport, mockDeleteSession, mockReplyWith, mockFollowUp } = vi.hoisted(() => ({
  mockCreateExamReport: vi.fn(),
  mockDeleteSession: vi.fn().mockResolvedValue(undefined),
  mockReplyWith: vi.fn().mockResolvedValue(undefined),
  mockFollowUp: vi.fn(),
}))

vi.mock('@/lib/students/exams', () => ({ createExamReport: mockCreateExamReport }))
vi.mock('@/lib/exam-report-flow/sessions', () => ({
  startExamReportSession: vi.fn(),
  advanceExamReportSession: vi.fn(),
  getActiveExamReportSession: vi.fn(),
  deleteExamReportSession: mockDeleteSession,
}))
vi.mock('@/lib/exams/postReport', () => ({ completeExamReportFollowUp: mockFollowUp }))
vi.mock('../shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../shared')>()
  return { ...actual, replyWith: mockReplyWith }
})

import { completeExamReport } from './student'
import type { HandlerContext } from '../shared'
import type { ExamReportSession } from '@/lib/exam-report-flow/sessions'

describe('completeExamReport', () => {
  it('does not finish webhook message processing before exam follow-up settles', async () => {
    let finishFollowUp!: () => void
    mockFollowUp.mockReturnValue(new Promise<void>((resolve) => { finishFollowUp = resolve }))
    mockCreateExamReport.mockResolvedValue({
      id: 'exam-1',
      studentId: 'student-1',
      subject: 'Math',
      examDate: '2026-09-15',
    })

    const ctx = {
      org: { id: 'org-1' },
      sender: { role: 'student', studentId: 'student-1' },
      senderPhone: '+972500000001',
      timezone: 'Asia/Jerusalem',
    } as HandlerContext
    const session = {
      student_id: 'student-1',
      draft_subject: 'Math',
      draft_title: 'Algebra',
      draft_exam_date: '2026-09-15',
    } as ExamReportSession
    let settled = false

    const work = completeExamReport(ctx, session).then(() => { settled = true })
    await vi.waitFor(() => expect(mockFollowUp).toHaveBeenCalledOnce())

    expect(settled).toBe(false)
    finishFollowUp()
    await work
    expect(settled).toBe(true)
  })
})
