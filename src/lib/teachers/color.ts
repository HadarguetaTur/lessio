/**
 * Teacher colours for the calendar.
 *
 * Status is the card's background; the teacher is its stripe. A teacher with
 * no chosen colour gets one derived from their id, so the colour is stable
 * across sessions and does not shift when another teacher is added. Only the
 * keys are stored (`teachers.color`); the Tailwind classes live here as
 * literal strings because Tailwind v4 only emits classes it can see.
 */

export const TEACHER_COLOR_KEYS = [
  'blue',
  'emerald',
  'purple',
  'amber',
  'rose',
  'cyan',
  'indigo',
  'orange',
  'teal',
  'pink',
] as const

export type TeacherColorKey = (typeof TEACHER_COLOR_KEYS)[number]

export interface TeacherColorClasses {
  /** `border-s-4` companion for a lesson card. */
  stripe: string
  /** Small filled circle (legend, chip, month cell). */
  dot: string
  /** Larger swatch for the colour picker. */
  swatch: string
  /** Selected filter chip. */
  chipActive: string
}

export const TEACHER_COLOR_CLASSES: Record<TeacherColorKey, TeacherColorClasses> = {
  blue: {
    stripe: 'border-s-blue-500',
    dot: 'bg-blue-500',
    swatch: 'bg-blue-500 ring-blue-500',
    chipActive: 'bg-blue-100 text-blue-900 border-blue-300',
  },
  emerald: {
    stripe: 'border-s-emerald-500',
    dot: 'bg-emerald-500',
    swatch: 'bg-emerald-500 ring-emerald-500',
    chipActive: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  },
  purple: {
    stripe: 'border-s-purple-500',
    dot: 'bg-purple-500',
    swatch: 'bg-purple-500 ring-purple-500',
    chipActive: 'bg-purple-100 text-purple-900 border-purple-300',
  },
  amber: {
    stripe: 'border-s-amber-500',
    dot: 'bg-amber-500',
    swatch: 'bg-amber-500 ring-amber-500',
    chipActive: 'bg-amber-100 text-amber-900 border-amber-300',
  },
  rose: {
    stripe: 'border-s-rose-500',
    dot: 'bg-rose-500',
    swatch: 'bg-rose-500 ring-rose-500',
    chipActive: 'bg-rose-100 text-rose-900 border-rose-300',
  },
  cyan: {
    stripe: 'border-s-cyan-500',
    dot: 'bg-cyan-500',
    swatch: 'bg-cyan-500 ring-cyan-500',
    chipActive: 'bg-cyan-100 text-cyan-900 border-cyan-300',
  },
  indigo: {
    stripe: 'border-s-indigo-500',
    dot: 'bg-indigo-500',
    swatch: 'bg-indigo-500 ring-indigo-500',
    chipActive: 'bg-indigo-100 text-indigo-900 border-indigo-300',
  },
  orange: {
    stripe: 'border-s-orange-500',
    dot: 'bg-orange-500',
    swatch: 'bg-orange-500 ring-orange-500',
    chipActive: 'bg-orange-100 text-orange-900 border-orange-300',
  },
  teal: {
    stripe: 'border-s-teal-500',
    dot: 'bg-teal-500',
    swatch: 'bg-teal-500 ring-teal-500',
    chipActive: 'bg-teal-100 text-teal-900 border-teal-300',
  },
  pink: {
    stripe: 'border-s-pink-500',
    dot: 'bg-pink-500',
    swatch: 'bg-pink-500 ring-pink-500',
    chipActive: 'bg-pink-100 text-pink-900 border-pink-300',
  },
}

export function isTeacherColorKey(value: unknown): value is TeacherColorKey {
  return typeof value === 'string' && (TEACHER_COLOR_KEYS as readonly string[]).includes(value)
}

/**
 * Derived colour for a teacher with no override. Every character of the id
 * takes part, so two uuids that share a first character still spread out.
 */
export function deriveTeacherColor(id: string): TeacherColorKey {
  let sum = 0
  for (let i = 0; i < id.length; i++) sum = (sum + id.charCodeAt(i) * (i + 1)) % 100_003
  return TEACHER_COLOR_KEYS[sum % TEACHER_COLOR_KEYS.length]
}

/** The colour to draw a teacher in: their chosen key, else one derived from the id. */
export function resolveTeacherColor(teacher: { id: string; color?: string | null }): TeacherColorKey {
  return isTeacherColorKey(teacher.color) ? teacher.color : deriveTeacherColor(teacher.id)
}
