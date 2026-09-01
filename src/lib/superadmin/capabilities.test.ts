import { describe, expect, it } from 'vitest'

import {
  PLATFORM_ROLES,
  ROLE_CAPABILITIES,
  capabilitiesFor,
  hasCapability,
  isPlatformReader,
  isPlatformRole,
  type PlatformCapability,
} from './capabilities'

describe('platform roles', () => {
  it('recognises every platform role and rejects tenant roles', () => {
    for (const role of PLATFORM_ROLES) expect(isPlatformRole(role)).toBe(true)
    for (const role of ['owner', 'admin', 'teacher', '', 'platform_', 'PLATFORM_SUPPORT']) {
      expect(isPlatformRole(role)).toBe(false)
    }
  })

  it('gives a tenant role no capabilities at all', () => {
    expect(capabilitiesFor('owner')).toEqual([])
    expect(capabilitiesFor('teacher')).toEqual([])
  })
})

describe('the capability matrix', () => {
  it('gives superadmin every capability', () => {
    const everything = new Set<PlatformCapability>()
    for (const caps of Object.values(ROLE_CAPABILITIES)) caps.forEach((c) => everything.add(c))
    expect(new Set(ROLE_CAPABILITIES.superadmin)).toEqual(everything)
  })

  it('lets only support and superadmin enter support mode', () => {
    // Impersonating a tenant is the sharpest capability there is. Billing,
    // marketing and viewer have no reason to read a customer's dashboard.
    const allowed = PLATFORM_ROLES.filter((r) =>
      hasCapability(ROLE_CAPABILITIES[r], 'support_mode.enter')
    )
    expect(allowed).toEqual(['superadmin', 'platform_support'])
  })

  it('keeps marketing away from tenant records', () => {
    const marketing = ROLE_CAPABILITIES.platform_marketing
    expect(hasCapability(marketing, 'orgs.read')).toBe(false)
    expect(hasCapability(marketing, 'support.read')).toBe(false)
    expect(hasCapability(marketing, 'billing.read')).toBe(false)
    expect(hasCapability(marketing, 'growth.write')).toBe(true)
  })

  it('lets only superadmin manage staff or touch a tenant record', () => {
    for (const cap of ['staff.manage', 'orgs.write', 'orgs.export'] as PlatformCapability[]) {
      const allowed = PLATFORM_ROLES.filter((r) => hasCapability(ROLE_CAPABILITIES[r], cap))
      expect(allowed).toEqual(['superadmin'])
    }
  })

  it('gives the viewer reads and no writes', () => {
    const viewer = ROLE_CAPABILITIES.platform_viewer
    for (const cap of viewer) {
      expect(cap.endsWith('.read')).toBe(true)
    }
  })

  it('gives support no billing power', () => {
    const support = ROLE_CAPABILITIES.platform_support
    expect(hasCapability(support, 'billing.read')).toBe(false)
    expect(hasCapability(support, 'billing.write')).toBe(false)
  })

  it('gives billing no way into a tenant dashboard', () => {
    const billing = ROLE_CAPABILITIES.platform_billing
    expect(hasCapability(billing, 'billing.write')).toBe(true)
    expect(hasCapability(billing, 'support_mode.enter')).toBe(false)
    expect(hasCapability(billing, 'orgs.export')).toBe(false)
  })

  it('never grants a write without the matching read', () => {
    // A role that can change something it cannot see is a UI that cannot exist.
    for (const role of PLATFORM_ROLES) {
      const caps = ROLE_CAPABILITIES[role]
      for (const cap of caps) {
        if (!cap.endsWith('.write')) continue
        const read = cap.replace(/\.write$/, '.read') as PlatformCapability
        expect(caps).toContain(read)
      }
    }
  })
})

describe('isPlatformReader', () => {
  it('matches the SQL predicate: every platform role except marketing', () => {
    expect(isPlatformReader('superadmin')).toBe(true)
    expect(isPlatformReader('platform_support')).toBe(true)
    expect(isPlatformReader('platform_billing')).toBe(true)
    expect(isPlatformReader('platform_viewer')).toBe(true)
    expect(isPlatformReader('platform_marketing')).toBe(false)
    expect(isPlatformReader('owner')).toBe(false)
  })
})
