import type { EntityType } from './validators'

/** Internal field keys for required-columns display (labels via `import.fields.{key}`). */
export const ENTITY_REQUIRED_FIELD_KEYS: Record<EntityType, string[]> = {
  students: ['full_name'],
  parents: ['full_name', 'phone'],
  teachers: ['full_name', 'email'],
  'lessons-schedule': ['teacher_name', 'student_name', 'day_of_week', 'start_time', 'duration_minutes'],
  'lessons-history': ['teacher_name', 'student_name', 'date', 'start_time', 'end_time'],
  'family-list': ['student_name', 'parent_name', 'parent_phone'],
}

export function getRequiredFieldKeys(entityType: EntityType): string[] {
  return ENTITY_REQUIRED_FIELD_KEYS[entityType]
}
