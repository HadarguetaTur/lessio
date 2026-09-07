import type { StudentGroup } from '@/lib/groups'

export type ScheduleFormResources = {
  teachers: { id: string; full_name: string }[]
  students: { id: string; full_name: string }[]
  groups: StudentGroup[]
  /** Lesson durations open to the current audience (admin / teacher) — from org settings. */
  durationValues: number[]
}
