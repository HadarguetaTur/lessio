/**
 * Day-of-week keys indexed by the JS convention (0 = Sunday), matching the
 * `common.days.*` catalog entries. Render with `t('common.days.' + DAY_KEYS[i])`
 * rather than storing day names here — the availability grid is shown in the
 * viewer's language.
 */
export const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

export type DayKey = (typeof DAY_KEYS)[number]
