import { describe, expect, it } from 'vitest'

import { detectLocaleFromText, resolveRecipientLocale } from './locale'

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
