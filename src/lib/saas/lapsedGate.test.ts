/**
 * Which screens a lapsed org loses, and which it keeps.
 *
 * The keeping matters as much as the blocking: an owner deciding whether to pay
 * must still be able to read their students, export their data and open a
 * support ticket. A gate that locked those would be holding the data hostage.
 */

import { describe, expect, it } from 'vitest'
import { isLapsedBlockedPath, lapsedReasonFor } from './lapsedGate'
import type { OrgSubscriptionState } from './subscriptions'

const DAY = 86_400_000

function state(over: Partial<OrgSubscriptionState> = {}): OrgSubscriptionState {
  return {
    subscriptionId: 'sub-1',
    planId: 'plan-1',
    planName: 'solo',
    status: 'active',
    billingInterval: 'monthly',
    trialEndsAt: null,
    currentPeriodEnd: new Date(Date.now() + 20 * DAY).toISOString(),
    cancelAtPeriodEnd: false,
    cardLastFour: '4242',
    features: {
      whatsapp_automation: true,
      ai_assistant: true,
      full_reports: true,
      leads: true,
      homework: true,
      parent_portal: true,
      integrations: true,
      data_retention: true,
    },
    ...over,
  }
}

describe('lapsedReasonFor', () => {
  it('does not lock a healthy subscription', () => {
    expect(lapsedReasonFor(state())).toBeNull()
  })

  it('does not lock a running trial', () => {
    expect(
      lapsedReasonFor(
        state({ planName: 'free', status: 'trial', trialEndsAt: new Date(Date.now() + 5 * DAY).toISOString() })
      )
    ).toBeNull()
  })

  it('does not lock a grandfathered org with no subscription row', () => {
    expect(lapsedReasonFor(null)).toBeNull()
  })

  it('locks an expired free trial', () => {
    expect(
      lapsedReasonFor(
        state({ planName: 'free', status: 'trial', trialEndsAt: new Date(Date.now() - DAY).toISOString() })
      )
    ).toBe('trial_ended')
  })

  it('locks a past_due org only once the grace window is over', () => {
    const inGrace = state({ status: 'past_due', currentPeriodEnd: new Date(Date.now() - 2 * DAY).toISOString() })
    expect(lapsedReasonFor(inGrace)).toBeNull()

    const graceOver = state({ status: 'past_due', currentPeriodEnd: new Date(Date.now() - 30 * DAY).toISOString() })
    expect(lapsedReasonFor(graceOver)).toBe('past_due_locked')
  })

  it('locks a cancelled subscription with its own reason', () => {
    // "You asked to stop" and "your card failed" need different copy.
    expect(lapsedReasonFor(state({ status: 'cancelled' }))).toBe('cancelled')
  })

  it('reports an expired trial that the checker already converted to read_only', () => {
    expect(
      lapsedReasonFor(state({ status: 'read_only', trialEndsAt: new Date(Date.now() - 3 * DAY).toISOString() }))
    ).toBe('trial_ended')
  })
})

describe('isLapsedBlockedPath', () => {
  it('blocks the working surfaces', () => {
    expect(isLapsedBlockedPath('/dashboard')).toBe(true)
    expect(isLapsedBlockedPath('/settings')).toBe(true)
    expect(isLapsedBlockedPath('/settings/whatsapp')).toBe(true)
    expect(isLapsedBlockedPath('/leads')).toBe(true)
    expect(isLapsedBlockedPath('/teachers')).toBe(true)
  })

  it('keeps the data readable', () => {
    for (const p of ['/students', '/parents', '/lessons', '/charges', '/billing', '/reports', '/homework']) {
      expect(isLapsedBlockedPath(p)).toBe(false)
    }
  })

  it('keeps billing reachable so the org can pay its way back', () => {
    expect(isLapsedBlockedPath('/account/billing')).toBe(false)
  })

  it('keeps support reachable', () => {
    expect(isLapsedBlockedPath('/support')).toBe(false)
  })

  it('keeps the privacy screen reachable for export and deletion', () => {
    // The one settings page that is about leaving rather than operating.
    expect(isLapsedBlockedPath('/settings/privacy')).toBe(false)
  })

  it('does not block a path that merely starts with the same letters', () => {
    expect(isLapsedBlockedPath('/dashboards-report')).toBe(false)
  })
})
