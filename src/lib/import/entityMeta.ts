import type { EntityType } from './validators'

const ENTITY_TITLES: Record<EntityType, string> = {
  students: 'תלמידים',
  parents: 'הורים',
  teachers: 'מורים',
  'lessons-schedule': 'מערכת שעות חוזרת',
  'lessons-history': 'היסטוריית שיעורים',
}

const REQUIRED_FIELDS: Record<EntityType, string[]> = {
  students: ['שם מלא'],
  parents: ['שם מלא', 'טלפון'],
  teachers: ['שם מלא', 'אימייל'],
  'lessons-schedule': ['שם מורה', 'שם תלמיד', 'יום בשבוע', 'שעת התחלה', 'משך (דקות)'],
  'lessons-history': ['שם מורה', 'שם תלמיד', 'תאריך', 'שעת התחלה', 'שעת סיום'],
}

export function getEntityTitle(entityType: EntityType): string {
  return ENTITY_TITLES[entityType]
}

export function getRequiredFields(entityType: EntityType): string[] {
  return REQUIRED_FIELDS[entityType]
}
