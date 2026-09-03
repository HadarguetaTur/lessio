import { describe, expect, it } from 'vitest'
import { decideNotificationStatus, type NotificationDecisionInput } from './notificationStatus'

/** A parent who can be messaged, so each test varies only what it is about. */
function input(overrides: Partial<NotificationDecisionInput> = {}): NotificationDecisionInput {
  return {
    notifyParent: undefined,
    orgDefault: true,
    hasParent: true,
    hasPhone: true,
    whatsappConnected: true,
    ...overrides,
  }
}

describe('decideNotificationStatus', () => {
  describe('the org default', () => {
    it('sends when the caller says nothing and the org default is on', () => {
      expect(decideNotificationStatus(input({ orgDefault: true }))).toBe('queued')
    })

    it('stays quiet when the caller says nothing and the org default is off', () => {
      expect(decideNotificationStatus(input({ orgDefault: false }))).toBe('disabled')
    })
  })

  describe('an explicit choice beats the default', () => {
    it('unticking wins over an org default of on', () => {
      expect(decideNotificationStatus(input({ notifyParent: false, orgDefault: true }))).toBe(
        'disabled'
      )
    })

    it('ticking wins over an org default of off', () => {
      expect(decideNotificationStatus(input({ notifyParent: true, orgDefault: false }))).toBe(
        'queued'
      )
    })
  })

  describe('reasons the message cannot go out', () => {
    it('reports no_phone over the org default when the parent has no number', () => {
      expect(decideNotificationStatus(input({ hasPhone: false }))).toBe('no_phone')
    })

    it('reports whatsapp_not_connected when the org has no WhatsApp', () => {
      expect(decideNotificationStatus(input({ whatsappConnected: false }))).toBe(
        'whatsapp_not_connected'
      )
    })

    it('is disabled when the charge has no parent at all', () => {
      expect(decideNotificationStatus(input({ hasParent: false }))).toBe('disabled')
    })

    it('prefers disabled over no_phone — the tutor opted out before we ever looked', () => {
      expect(decideNotificationStatus(input({ notifyParent: false, hasPhone: false }))).toBe(
        'disabled'
      )
    })
  })
})
