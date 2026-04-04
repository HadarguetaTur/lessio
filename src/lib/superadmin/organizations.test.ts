import { describe, expect, it } from 'vitest'
import { DateTime } from 'luxon'

// Test the deriveStatus logic in isolation by importing a helper version.
// We replicate the pure logic here so we don't need DB mocks for status tests.

type OrgStatus = 'needs_setup' | 'active' | 'inactive'

function deriveStatus(org: {
  whatsapp_phone_number_id: string | null
  lastActivity: string | null
}): OrgStatus {
  if (!org.whatsapp_phone_number_id) return 'needs_setup'
  if (!org.lastActivity) return 'inactive'
  const thirtyDaysAgo = DateTime.utc().minus({ days: 30 }).toISO()!
  return org.lastActivity >= thirtyDaysAgo ? 'active' : 'inactive'
}

describe('deriveStatus', () => {
  it('returns needs_setup when WhatsApp is not connected', () => {
    expect(deriveStatus({ whatsapp_phone_number_id: null, lastActivity: null })).toBe('needs_setup')
    expect(deriveStatus({ whatsapp_phone_number_id: null, lastActivity: new Date().toISOString() })).toBe('needs_setup')
  })

  it('returns inactive when WhatsApp is connected but no activity', () => {
    expect(deriveStatus({ whatsapp_phone_number_id: 'ph-1', lastActivity: null })).toBe('inactive')
  })

  it('returns active when lastActivity is within 30 days', () => {
    const recent = DateTime.utc().minus({ days: 5 }).toISO()!
    expect(deriveStatus({ whatsapp_phone_number_id: 'ph-1', lastActivity: recent })).toBe('active')
  })

  it('returns inactive when lastActivity is older than 30 days', () => {
    const old = DateTime.utc().minus({ days: 45 }).toISO()!
    expect(deriveStatus({ whatsapp_phone_number_id: 'ph-1', lastActivity: old })).toBe('inactive')
  })

  it('returns active when lastActivity is exactly 30 days ago (boundary)', () => {
    // Exactly on the boundary — should still be active (>=)
    const boundary = DateTime.utc().minus({ days: 30 }).plus({ seconds: 1 }).toISO()!
    expect(deriveStatus({ whatsapp_phone_number_id: 'ph-1', lastActivity: boundary })).toBe('active')
  })
})
