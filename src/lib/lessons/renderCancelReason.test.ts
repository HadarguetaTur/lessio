import { describe, it, expect } from 'vitest'
import { renderCancelReason, SERIES_CANCEL_REASON } from './renderCancelReason'
import he from '../../../messages/he.json'
import en from '../../../messages/en.json'

/**
 * `t` scoped to the `lessons` namespace, resolving dotted keys the way
 * next-intl does. Reading the real message files is the point: the bug this
 * covers was a key that existed in neither, rendered as a raw path in
 * production, and no test noticed because none of them touched the catalogue.
 */
function translator(messages: Record<string, unknown>) {
  const lessons = messages.lessons as Record<string, unknown>
  return (key: string): string => {
    const value = key.split('.').reduce<unknown>(
      (node, part) => (node as Record<string, unknown> | undefined)?.[part],
      lessons
    )
    if (typeof value !== 'string') throw new Error(`MISSING_MESSAGE: lessons.${key}`)
    return value
  }
}

const CATALOGUES = [
  ['he', he as unknown as Record<string, unknown>],
  ['en', en as unknown as Record<string, unknown>],
] as const

describe('renderCancelReason', () => {
  it('returns null for a lesson that was never cancelled', () => {
    expect(renderCancelReason(null, translator(he))).toBeNull()
    expect(renderCancelReason(undefined, translator(he))).toBeNull()
    expect(renderCancelReason('', translator(he))).toBeNull()
  })

  describe.each(CATALOGUES)('against messages/%s.json', (_locale, messages) => {
    const t = translator(messages)

    it.each([
      SERIES_CANCEL_REASON,
      'CANCELLED_VIA_WHATSAPP',
      'CANCELLED_VIA_PORTAL',
      'TEACHER_DAY_OFF',
    ])('resolves %s to a real translated string', (code) => {
      const rendered = renderCancelReason(code, t)
      expect(rendered).toBeTruthy()
      // The failure mode was a raw key path leaking to the screen.
      expect(rendered).not.toContain('cancelReasons')
      expect(rendered).not.toBe(code)
    })
  })

  it('passes an unrecognised reason through untouched', () => {
    const typed = 'ההורה ביקש לדחות בשבוע'
    expect(renderCancelReason(typed, translator(he))).toBe(typed)
  })
})
