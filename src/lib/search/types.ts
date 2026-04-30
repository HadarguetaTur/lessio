export type SearchStudentHit = {
  kind: 'student'
  id: string
  full_name: string
  grade: string | null
}

export type SearchParentHit = {
  kind: 'parent'
  id: string
  full_name: string
  phone: string | null
}

export type SearchLessonHit = {
  kind: 'lesson'
  id: string
  start_at: string
  status: string
  student_names: string[]
}

export type SearchChargeHit = {
  kind: 'charge'
  id: string
  amount: number
  status: string
  charge_type: string
  parent_id: string
  parent_name: string
}

export type SearchHit =
  | SearchStudentHit
  | SearchParentHit
  | SearchLessonHit
  | SearchChargeHit

export interface GlobalSearchResponse {
  students: SearchStudentHit[]
  parents: SearchParentHit[]
  lessons: SearchLessonHit[]
  charges: SearchChargeHit[]
}
