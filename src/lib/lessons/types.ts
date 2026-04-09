export type LessonStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show'
export type LessonType = 'individual' | 'pair' | 'group'

export interface Lesson {
  id: string
  start_at: string
  end_at: string
  status: LessonStatus
  lesson_type: LessonType
  cancel_reason: string | null
  series_id: string | null
  teacher: { id: string; full_name: string }
  /** Primary (first enrolled) student. For group lessons use a separate query. */
  student: { id: string; full_name: string }
}

export interface LessonAccessScope {
  organizationId: string
  teacherId: string
}
