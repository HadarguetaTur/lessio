import type { Lesson, LessonType } from '@/lib/lessons/types'

/**
 * A translator scoped to the `lessons` namespace — the shape shared by
 * next-intl's `useTranslations('lessons')` and `getTranslations('lessons')`.
 */
export type LessonTitleTranslator = (key: string, values?: Record<string, number>) => string

const TYPE_LABEL_KEY: Record<Exclude<LessonType, 'individual'>, string> = {
  pair: 'typePair',
  group: 'typeGroup',
  custom: 'typeCustom',
}

/**
 * The one-line name of a lesson for calendars, lists and labels.
 *
 *  - A group lesson still linked to its student group shows the group's name.
 *  - Up to two participants are named outright ("דנה + יוסי").
 *  - Larger rosters (a custom lesson, or a group lesson whose group is gone)
 *    show the lesson type and a head count, which fits a calendar block.
 */
export function getLessonTitle(
  lesson: Pick<Lesson, 'lesson_type' | 'students' | 'group'>,
  t: LessonTitleTranslator
): string {
  if (lesson.group?.name) return lesson.group.name

  const names = lesson.students.map((s) => s.full_name).filter(Boolean)
  if (names.length === 0) return '—'
  // An individual lesson has one student by definition; if the data ever
  // disagrees, naming everyone is more honest than a made-up type label.
  if (names.length <= 2 || lesson.lesson_type === 'individual') return names.join(' + ')

  return `${t(TYPE_LABEL_KEY[lesson.lesson_type])} · ${t('rosterCount', { count: names.length })}`
}
