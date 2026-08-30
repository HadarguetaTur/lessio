import type { ValidatedRow } from './validators'

type NamedRecord = { id: string; name: string }

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

/**
 * Marks lesson rows whose teacher or student cannot be resolved before import.
 * These are blocking errors: executing such a row can only skip it, so calling
 * it "valid" in the preview would be a false success.
 */
export function markMissingLessonDependencies(
  rows: ValidatedRow[],
  teachers: NamedRecord[],
  students: NamedRecord[],
  messages: {
    teacherNotFound: (name: string) => string
    studentNotFound: (name: string) => string
  }
): ValidatedRow[] {
  const teacherNames = new Set(teachers.map((teacher) => normalizeName(teacher.name)))
  const studentNames = new Set(students.map((student) => normalizeName(student.name)))

  return rows.map((row) => {
    if (row.status === 'error') return row

    const dependencies: NonNullable<ValidatedRow['missingDependencies']> = []
    const errors = [...row.errors]
    const teacherName = row.data.teacher_name?.trim()
    const studentName = row.data.student_name?.trim()

    if (teacherName && !teacherNames.has(normalizeName(teacherName))) {
      dependencies.push({ type: 'teacher', name: teacherName })
      errors.push(messages.teacherNotFound(teacherName))
    }
    if (studentName && !studentNames.has(normalizeName(studentName))) {
      dependencies.push({ type: 'student', name: studentName })
      errors.push(messages.studentNotFound(studentName))
    }

    if (dependencies.length === 0) return row
    return {
      ...row,
      status: 'error',
      errors,
      missingDependencies: dependencies,
    }
  })
}
