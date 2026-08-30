import { describe, expect, it } from 'vitest'
import { markMissingLessonDependencies } from './lessonDependencies'
import type { ValidatedRow } from './validators'

const row = (teacher: string, student: string): ValidatedRow => ({
  rowIndex: 0,
  status: 'valid',
  data: { teacher_name: teacher, student_name: student },
  errors: [],
  warnings: [],
})

const messages = {
  teacherNotFound: (name: string) => `teacher:${name}`,
  studentNotFound: (name: string) => `student:${name}`,
}

describe('markMissingLessonDependencies', () => {
  it('keeps a lesson valid when its teacher and student exist', () => {
    const [result] = markMissingLessonDependencies(
      [row('Dana Cohen', 'Noa Levi')],
      [{ id: 'teacher-1', name: 'Dana Cohen' }],
      [{ id: 'student-1', name: 'Noa Levi' }],
      messages
    )

    expect(result.status).toBe('valid')
    expect(result.missingDependencies).toBeUndefined()
  })

  it('marks missing teachers and students as blocking preview errors', () => {
    const [result] = markMissingLessonDependencies(
      [row('Missing Teacher', 'Missing Student')],
      [],
      [],
      messages
    )

    expect(result.status).toBe('error')
    expect(result.errors).toEqual(['teacher:Missing Teacher', 'student:Missing Student'])
    expect(result.missingDependencies).toEqual([
      { type: 'teacher', name: 'Missing Teacher' },
      { type: 'student', name: 'Missing Student' },
    ])
  })

  it('matches names without case or repeated-space differences', () => {
    const [result] = markMissingLessonDependencies(
      [row('  DANA   COHEN ', 'NOA LEVI')],
      [{ id: 'teacher-1', name: 'Dana Cohen' }],
      [{ id: 'student-1', name: 'Noa Levi' }],
      messages
    )

    expect(result.status).toBe('valid')
  })

  it('preserves schema errors without adding dependency noise', () => {
    const invalid = row('', '')
    invalid.status = 'error'
    invalid.errors = ['required']

    const [result] = markMissingLessonDependencies([invalid], [], [], messages)
    expect(result.errors).toEqual(['required'])
    expect(result.missingDependencies).toBeUndefined()
  })
})
