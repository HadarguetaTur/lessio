import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFrom = vi.fn()
const mockUpload = vi.fn()

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({
    from: (t: string) => mockFrom(t),
    storage: { from: () => ({ upload: mockUpload }) },
  }),
}))

import { ExamReportSchema, createExamReport, scoreExam } from './exams'

const ORG = 'org-1'
const STUDENT = '5e9d0a49-0000-4000-8000-000000000001'

function chain(result: unknown) {
  const self: Record<string, unknown> = {}
  const pass = () => self
  ;['select', 'eq', 'insert', 'update', 'order', 'gte', 'lte'].forEach((m) => {
    self[m] = pass
  })
  self['single'] = () => Promise.resolve(result)
  self['maybeSingle'] = () => Promise.resolve(result)
  return self
}

const REPORT_ROW = {
  id: 'exam-1',
  organization_id: ORG,
  student_id: STUDENT,
  subject: 'מתמטיקה',
  title: 'משוואות',
  exam_date: '2026-09-15',
  score: null,
  max_score: 100,
  notes: null,
  source: 'parent',
  status: 'reported',
  description: null,
  storage_path: null,
  file_name: null,
  mime_type: null,
  reported_by_parent_id: 'parent-1',
  created_by: null,
  created_at: 'now',
  updated_at: 'now',
}

describe('ExamReportSchema', () => {
  it('accepts a report without a score', () => {
    const parsed = ExamReportSchema.safeParse({
      studentId: STUDENT,
      subject: 'מתמטיקה',
      title: 'משוואות',
      examDate: '2026-09-15',
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects a malformed date', () => {
    const parsed = ExamReportSchema.safeParse({
      studentId: STUDENT,
      subject: 'מתמטיקה',
      title: 'משוואות',
      examDate: '15/09/2026',
    })
    expect(parsed.success).toBe(false)
  })
})

describe('createExamReport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockImplementation(() => chain({ data: REPORT_ROW, error: null }))
  })

  it('inserts a reported exam with the right source and no score', async () => {
    let inserted: Record<string, unknown> | null = null
    mockFrom.mockImplementation(() => {
      const self = chain({ data: REPORT_ROW, error: null }) as Record<string, unknown>
      self['insert'] = (row: Record<string, unknown>) => {
        inserted = row
        return self
      }
      return self
    })

    const exam = await createExamReport({
      orgId: ORG,
      studentId: STUDENT,
      source: 'parent',
      reportedByParentId: 'parent-1',
      input: { studentId: STUDENT, subject: 'מתמטיקה', title: 'משוואות', examDate: '2026-09-15' },
    })

    expect(exam.status).toBe('reported')
    expect(inserted).toMatchObject({
      source: 'parent',
      status: 'reported',
      score: null,
      reported_by_parent_id: 'parent-1',
    })
  })

  it('refuses a studentId that does not match the input', async () => {
    await expect(
      createExamReport({
        orgId: ORG,
        studentId: 'someone-else',
        source: 'student',
        input: { studentId: STUDENT, subject: 'א', title: 'ב', examDate: '2026-09-15' },
      })
    ).rejects.toThrow('studentId mismatch')
  })
})

describe('scoreExam', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('marks the exam scored', async () => {
    let updated: Record<string, unknown> | null = null
    mockFrom.mockImplementation(() => {
      const self = chain({
        data: { ...REPORT_ROW, score: 90, status: 'scored' },
        error: null,
      }) as Record<string, unknown>
      self['update'] = (row: Record<string, unknown>) => {
        updated = row
        return self
      }
      return self
    })

    const exam = await scoreExam({ orgId: ORG, examId: 'exam-1', score: 90, maxScore: 100 })

    expect(exam.score).toBe(90)
    expect(updated).toMatchObject({ score: 90, status: 'scored' })
  })

  it('rejects a score above the maximum', async () => {
    await expect(
      scoreExam({ orgId: ORG, examId: 'exam-1', score: 110, maxScore: 100 })
    ).rejects.toThrow()
  })
})
