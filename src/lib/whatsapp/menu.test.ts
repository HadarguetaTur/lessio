import { describe, expect, it } from 'vitest'

import {
  decodeMenuPayload,
  encodeMenuPayload,
  firstName,
  isGreeting,
  needsStudent,
} from './menu'

describe('menu payload encoding', () => {
  it('round-trips an action', () => {
    expect(decodeMenuPayload(encodeMenuPayload('cancel'))).toEqual({
      action: 'cancel',
      studentId: undefined,
    })
  })

  it('round-trips an action with a student', () => {
    const id = '0142401d-89d0-47ad-bd3f-20edfb4ca444'
    expect(decodeMenuPayload(encodeMenuPayload('book', id))).toEqual({
      action: 'book',
      studentId: id,
    })
  })

  it('ignores payloads that are not ours', () => {
    // Falling through to keyword handling matters: Meta echoes back ids from
    // other interactive messages (and the OTP copy-code button) too.
    expect(decodeMenuPayload(undefined)).toBeNull()
    expect(decodeMenuPayload('')).toBeNull()
    expect(decodeMenuPayload('some-other-button')).toBeNull()
    expect(decodeMenuPayload('m:launch_missiles')).toBeNull()
    expect(decodeMenuPayload('m')).toBeNull()
  })
})

describe('needsStudent', () => {
  it('only booking needs a specific student', () => {
    expect(needsStudent('book')).toBe(true)
    // The cancellation and schedule replies already label every line with the
    // student's name, so a picker there would only remove information.
    expect(needsStudent('cancel')).toBe(false)
    expect(needsStudent('schedule')).toBe(false)
    expect(needsStudent('balance')).toBe(false)
    expect(needsStudent('portal')).toBe(false)
  })
})

describe('isGreeting', () => {
  it('matches bare greetings in both languages', () => {
    for (const t of ['היי', 'הי', 'שלום', 'אהלן', 'hi', 'Hello', 'HEY', 'בוקר טוב', 'שלום!']) {
      expect(isGreeting(t), t).toBe(true)
    }
  })

  it('does not swallow a real question that opens with a greeting', () => {
    for (const t of [
      'היי, מתי השיעור הבא?',
      'hi, can I move my lesson?',
      'שלום רציתי לשאול על החיוב',
      'ביטול',
      'xyz',
      '2',
    ]) {
      expect(isGreeting(t), t).toBe(false)
    }
  })
})

describe('firstName', () => {
  it('takes the first token', () => {
    expect(firstName('יעל לוי')).toBe('יעל')
    expect(firstName('  דנה  כהן ')).toBe('דנה')
  })

  it('returns an empty string when there is no name', () => {
    expect(firstName(null)).toBe('')
    expect(firstName(undefined)).toBe('')
    expect(firstName('   ')).toBe('')
  })
})
