import { describe, expect, it } from 'vitest'

import {
  detectLocaleForPersistence,
  detectLocaleFromText,
  resolvePersistedLocale,
  resolveRecipientLocale,
} from './locale'

describe('detectLocaleFromText', () => {
  it('detects Hebrew from Hebrew letters', () => {
    expect(detectLocaleFromText('היי, מתי השיעור?')).toBe('he')
  })

  it('detects English from Latin letters', () => {
    expect(detectLocaleFromText('hi, when is my lesson?')).toBe('en')
  })

  it('prefers Hebrew when the message mixes scripts', () => {
    expect(detectLocaleFromText('שלח לי link בבקשה')).toBe('he')
  })

  it('returns null for text with no language signal', () => {
    // A bare number selects a lesson from the cancellation list — it must not
    // be read as English and flip the parent's stored language.
    expect(detectLocaleFromText('2')).toBeNull()
    expect(detectLocaleFromText('👍')).toBeNull()
    expect(detectLocaleFromText('  ')).toBeNull()
    expect(detectLocaleFromText('+972501234567')).toBeNull()
  })

  it('does not read a lone loanword as English', () => {
    // The bug this exists to stop: a Hebrew-speaking parent replying "ok" or
    // "toda" to a reminder, and receiving English from then on.
    expect(detectLocaleFromText('ok')).toBeNull()
    expect(detectLocaleFromText('OK!')).toBeNull()
    expect(detectLocaleFromText('toda')).toBeNull()
    expect(detectLocaleFromText('thanks')).toBeNull()
    expect(detectLocaleFromText('beseder, toda')).toBeNull()
  })

  it('still detects English from a real sentence', () => {
    expect(detectLocaleFromText('can we move the lesson to Monday?')).toBe('en')
  })
})

describe('detectLocaleForPersistence', () => {
  it('needs a sentence, not a word', () => {
    expect(detectLocaleForPersistence('ok')).toBeNull()
    expect(detectLocaleForPersistence('yes please')).toBeNull()
    expect(detectLocaleForPersistence('can we move the lesson to Monday?')).toBe('en')
  })

  it('treats any Hebrew word as Hebrew', () => {
    expect(detectLocaleForPersistence('כן')).toBe('he')
  })
})

describe('resolvePersistedLocale', () => {
  it('keeps a Hebrew parent on Hebrew when they type "ok"', () => {
    expect(
      resolvePersistedLocale({ role: 'parent', stored: 'he', text: 'ok' })
    ).toBeNull()
  })

  it('follows a genuine switch to English', () => {
    expect(
      resolvePersistedLocale({
        role: 'parent',
        stored: 'he',
        text: 'Hi, could you please send me the schedule for next week?',
      })
    ).toBe('en')
  })

  it('never rewrites a staff member’s dashboard language', () => {
    // profiles.preferred_locale seeds the dashboard locale cookie at login, so
    // an owner texting their own business number must not change it.
    expect(
      resolvePersistedLocale({
        role: 'staff',
        stored: 'he',
        text: 'Hi, could you please send me the schedule for next week?',
      })
    ).toBeNull()
    expect(
      resolvePersistedLocale({
        role: 'teacher',
        stored: 'he',
        text: 'Hi, could you please send me the schedule for next week?',
      })
    ).toBeNull()
  })

  it('writes nothing for a tapped button or an unknown sender', () => {
    expect(
      resolvePersistedLocale({
        role: 'parent',
        stored: 'he',
        text: 'Daniel Adams',
        isInteractiveReply: true,
      })
    ).toBeNull()
    expect(
      resolvePersistedLocale({ role: 'unknown', stored: null, text: 'hello there friends' })
    ).toBeNull()
  })

  it('writes nothing when the detection agrees with what is stored', () => {
    expect(
      resolvePersistedLocale({ role: 'parent', stored: 'en', text: 'when is the next lesson?' })
    ).toBeNull()
  })
})

describe('resolveRecipientLocale', () => {
  it('follows the language of the message being answered', () => {
    expect(
      resolveRecipientLocale({ stored: 'he', detected: 'en', orgDefault: 'he' })
    ).toBe('en')
  })

  it('falls back to the stored preference when the message gives no signal', () => {
    expect(
      resolveRecipientLocale({ stored: 'en', detected: null, orgDefault: 'he' })
    ).toBe('en')
  })

  it('falls back to the org default when nothing is known', () => {
    expect(resolveRecipientLocale({ orgDefault: 'en' })).toBe('en')
    expect(resolveRecipientLocale({ stored: null, detected: null, orgDefault: null })).toBe('he')
  })

  it('ignores a stored value that is not a supported locale', () => {
    expect(resolveRecipientLocale({ stored: 'fr', orgDefault: 'en' })).toBe('en')
  })
})
