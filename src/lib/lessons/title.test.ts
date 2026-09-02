import { describe, expect, it } from 'vitest'
import { getLessonTitle } from './title'

const t = (key: string, values?: Record<string, number>) => {
  const table: Record<string, string> = {
    typePair: 'זוגי',
    typeGroup: 'קבוצתי',
    typeCustom: 'מותאם אישית',
    rosterCount: `${values?.count ?? '?'} תלמידים`,
  }
  return table[key] ?? key
}

const student = (n: number) => ({ id: `s${n}`, full_name: `תלמיד ${n}` })

describe('getLessonTitle', () => {
  it('names the group when the lesson is still linked to one', () => {
    expect(
      getLessonTitle(
        { lesson_type: 'group', group: { id: 'g1', name: 'חשבון ה׳' }, students: [student(1), student(2), student(3)] },
        t
      )
    ).toBe('חשבון ה׳')
  })

  it('shows the single student of an individual lesson', () => {
    expect(getLessonTitle({ lesson_type: 'individual', group: null, students: [student(1)] }, t)).toBe('תלמיד 1')
  })

  it('joins both names of a pair', () => {
    expect(getLessonTitle({ lesson_type: 'pair', group: null, students: [student(1), student(2)] }, t)).toBe(
      'תלמיד 1 + תלמיד 2'
    )
  })

  it('falls back to type + head count for a group lesson whose group is gone', () => {
    expect(
      getLessonTitle({ lesson_type: 'group', group: null, students: [student(1), student(2), student(3), student(4)] }, t)
    ).toBe('קבוצתי · 4 תלמידים')
  })

  it('uses the custom label for a large custom roster', () => {
    expect(
      getLessonTitle({ lesson_type: 'custom', group: null, students: [student(1), student(2), student(3)] }, t)
    ).toBe('מותאם אישית · 3 תלמידים')
  })

  it('still names two students of a small custom lesson', () => {
    expect(getLessonTitle({ lesson_type: 'custom', group: null, students: [student(1), student(2)] }, t)).toBe(
      'תלמיד 1 + תלמיד 2'
    )
  })

  it('renders a dash when nobody is enrolled', () => {
    expect(getLessonTitle({ lesson_type: 'group', group: null, students: [] }, t)).toBe('—')
  })
})
