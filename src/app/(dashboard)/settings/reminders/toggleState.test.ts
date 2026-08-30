import { describe, it, expect } from 'vitest'
import { resolveRemindersToggleState } from './toggleState'

describe('resolveRemindersToggleState', () => {
  it('on with a connected number — reminders really go out', () => {
    expect(
      resolveRemindersToggleState({ hasWhatsApp: true, currentlyEnabled: true })
    ).toEqual({ onButNotSending: false })
  })

  it('on with no number — the state the audit found, and the one new orgs ship in', () => {
    expect(
      resolveRemindersToggleState({ hasWhatsApp: false, currentlyEnabled: true })
    ).toEqual({ onButNotSending: true })
  })

  it('off with no number — honest silence, nothing to warn about', () => {
    expect(
      resolveRemindersToggleState({ hasWhatsApp: false, currentlyEnabled: false })
    ).toEqual({ onButNotSending: false })
  })

  it('off with a number — deliberately turned off, not a fault', () => {
    expect(
      resolveRemindersToggleState({ hasWhatsApp: true, currentlyEnabled: false })
    ).toEqual({ onButNotSending: false })
  })

  it('never warns while a number is connected', () => {
    for (const currentlyEnabled of [true, false]) {
      expect(
        resolveRemindersToggleState({ hasWhatsApp: true, currentlyEnabled }).onButNotSending
      ).toBe(false)
    }
  })
})
