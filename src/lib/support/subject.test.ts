import { describe, it, expect } from 'vitest'
import { subjectFrom } from './subject'

describe('subjectFrom()', () => {
  it('takes the first sentence', () => {
    expect(subjectFrom('כפתור התשלום לא עובד. ניסיתי פעמיים.')).toBe('כפתור התשלום לא עובד.')
  })

  it('takes the first line when there is no sentence break', () => {
    expect(subjectFrom('הכל נשבר\nובמיוחד החיובים')).toBe('הכל נשבר')
  })

  it('truncates a long opening line with an ellipsis', () => {
    const subject = subjectFrom('x'.repeat(200))
    expect(subject).toHaveLength(80)
    expect(subject.endsWith('…')).toBe(true)
  })

  it('falls back to the body when the first line is blank', () => {
    expect(subjectFrom('\n\nמשהו קרה')).toBe('משהו קרה')
  })

  it('handles a single short message', () => {
    expect(subjectFrom('היי')).toBe('היי')
  })
})
