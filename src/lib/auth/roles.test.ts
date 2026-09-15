import { describe, expect, it } from 'vitest'
import {
  assertOrganizationCapability,
  canManageEconomics,
  canManageOperations,
  canPublishEconomics,
  canViewEconomics,
  hasOrganizationCapability,
  isOrganizationRole,
} from './roles'

describe('organisation role capabilities', () => {
  it('recognises office_manager as a tenant role', () => {
    expect(isOrganizationRole('office_manager')).toBe(true)
    expect(isOrganizationRole('platform_support')).toBe(false)
  })

  it('preserves admin economics read access', () => {
    expect(canViewEconomics('admin')).toBe(true)
    expect(canManageEconomics('admin')).toBe(false)
  })

  it('keeps office_manager operational only', () => {
    expect(canManageOperations('office_manager')).toBe(true)
    expect(hasOrganizationCapability('office_manager', 'delivery.read')).toBe(true)
    expect(canViewEconomics('office_manager')).toBe(false)
    expect(canPublishEconomics('office_manager')).toBe(false)
    expect(() => assertOrganizationCapability('office_manager', 'economics.read')).toThrow('FORBIDDEN')
  })

  it('keeps teacher access scoped to delivery visibility', () => {
    expect(hasOrganizationCapability('teacher', 'delivery.read')).toBe(true)
    expect(canManageOperations('teacher')).toBe(false)
    expect(canViewEconomics('teacher')).toBe(false)
  })
})
