export type LessonStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show'
export type LessonType = 'individual' | 'pair' | 'group' | 'custom'

export interface Lesson {
  id: string
  start_at: string
  end_at: string
  status: LessonStatus
  lesson_type: LessonType
  cancel_reason: string | null
  series_id: string | null
  teacher: { id: string; full_name: string }
  /** Everyone enrolled, in enrolment order. Display through getLessonTitle(). */
  students: { id: string; full_name: string }[]
  /**
   * The student group a group lesson was created from. Null for other lesson
   * types, for group lessons created before the link existed, and once the
   * group is deleted.
   */
  group: { id: string; name: string } | null
}

export interface LessonAccessScope {
  organizationId: string
  teacherId: string
}
