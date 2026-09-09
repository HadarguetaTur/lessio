/**
 * The word-list half of the promotional check.
 *
 * Two failure modes matter and pull against each other: letting a promotion out
 * under a utility template (a Meta policy breach), and blocking an ordinary
 * "the lesson moved to room 3" so an owner cannot tell parents anything. The
 * list is kept narrow for the second reason, and the AI pass covers what it
 * misses.
 */

import { describe, it, expect } from 'vitest'
import { heuristicLooksPromotional } from './classify'

describe('catches a promotion', () => {
  const promotional = [
    'נפתחה ההרשמה לסדנת הקיץ, מספר המקומות מוגבל',
    'מבצע מיוחד למצטרפים החודש',
    'הנחה של 20% למי שנרשם עד יום ראשון',
    'פותחים חוג חדש בימי שלישי, הצטרפו אלינו',
    'Registration is open for the summer workshop',
    'Special offer: 15% off for new students',
    'Last chance to sign up for the new course',
  ]

  for (const text of promotional) {
    it(text.slice(0, 40), () => {
      expect(heuristicLooksPromotional(text).promotional).toBe(true)
    })
  }

  it('names the term it matched, so the owner is told why', () => {
    expect(heuristicLooksPromotional('נפתחה ההרשמה לקיץ').matched).toBe('הרשמה')
  })

  it('reads a price or a percentage as an offer', () => {
    expect(heuristicLooksPromotional('השיעור הבא יעלה ₪250').promotional).toBe(true)
    expect(heuristicLooksPromotional('30% off this month').promotional).toBe(true)
  })
})

describe('lets a real service update through', () => {
  const service = [
    'השיעור ביום ראשון יתקיים בחדר 3 במקום בחדר 1',
    'תזכורת: מחר יש מבחן, נא להביא מחשבון',
    'החוג ביום שלישי מבוטל בגלל מזג האוויר, נעדכן על מועד חלופי',
    'שלום להורים, נא לוודא שהילדים מביאים את הגיטרה לשיעור',
    'This week the class meets in room 3 instead of room 1',
    'A reminder that the recital is on Friday at 18:00',
    'Sundays lesson is cancelled; we will offer a replacement time',
  ]

  for (const text of service) {
    it(text.slice(0, 40), () => {
      const result = heuristicLooksPromotional(text)
      expect(result.promotional, result.matched).toBe(false)
    })
  }

  it('does not trip on the word "class" or "חוג" on its own', () => {
    expect(heuristicLooksPromotional('החוג מתחיל בשעה 17:00').promotional).toBe(false)
    expect(heuristicLooksPromotional('The class starts at 17:00').promotional).toBe(false)
  })

  it('does not read a time or a date as a price', () => {
    expect(heuristicLooksPromotional('נתראה ב-17:00 ביום 12/9').promotional).toBe(false)
  })
})

describe('matching is case-insensitive', () => {
  it('catches shouted English', () => {
    expect(heuristicLooksPromotional('SIGN UP NOW').promotional).toBe(true)
  })
})
