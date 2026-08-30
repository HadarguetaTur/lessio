import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockNotifyExamReported, mockApplyExamPolicy } = vi.hoisted(() => ({
  mockNotifyExamReported: vi.fn(),
  mockApplyExamPolicy: vi.fn(),
}))

vi.mock('@/lib/exams/notify', () => ({ notifyExamReported: mockNotifyExamReported }))
vi.mock('@/lib/exams/policy', () => ({ applyExamPolicy: mockApplyExamPolicy }))

import { completeExamReportFollowUp } from './postReport'
import type { StudentExam } from '@/lib/students/exams'

const exam = { id: 'exam-1', studentId: 'student-1' } as StudentExam

describe('completeExamReportFollowUp', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNotifyExamReported.mockResolvedValue(undefined)
    mockApplyExamPolicy.mockResolvedValue(undefined)
  })

  it('does not resolve until notification and state policy work both settle', async () => {
    let finishPolicy!: () => void
    mockApplyExamPolicy.mockReturnValue(new Promise<void>((resolve) => { finishPolicy = resolve }))
    let settled = false

    const work = completeExamReportFollowUp({ orgId: 'org-1', exam }).then(() => {
      settled = true
    })
    await Promise.resolve()

    expect(mockNotifyExamReported).toHaveBeenCalledOnce()
    expect(mockApplyExamPolicy).toHaveBeenCalledOnce()
    expect(settled).toBe(false)

    finishPolicy()
    await work
    expect(settled).toBe(true)
  })

  it('still executes policy when notification delivery fails', async () => {
    mockNotifyExamReported.mockRejectedValue(new Error('notification unavailable'))

    await expect(completeExamReportFollowUp({ orgId: 'org-1', exam })).resolves.toBeUndefined()

    expect(mockApplyExamPolicy).toHaveBeenCalledOnce()
  })

  it('contains policy failure so successful exam creation remains independent', async () => {
    mockApplyExamPolicy.mockRejectedValue(new Error('temporary database failure'))

    await expect(completeExamReportFollowUp({ orgId: 'org-1', exam })).resolves.toBeUndefined()

    expect(mockNotifyExamReported).toHaveBeenCalledOnce()
  })
})
