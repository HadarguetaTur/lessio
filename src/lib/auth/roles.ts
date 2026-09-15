export const ORGANIZATION_ROLES = ['owner', 'admin', 'office_manager', 'teacher'] as const

export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number]

export type OrganizationCapability =
  | 'operations.manage'
  | 'delivery.read'
  | 'economics.read'
  | 'economics.manage'
  | 'economics.publish'

const ROLE_CAPABILITIES: Record<OrganizationRole, readonly OrganizationCapability[]> = {
  owner: ['operations.manage', 'delivery.read', 'economics.read', 'economics.manage', 'economics.publish'],
  admin: ['operations.manage', 'delivery.read', 'economics.read'],
  office_manager: ['operations.manage', 'delivery.read'],
  teacher: ['delivery.read'],
}

export function isOrganizationRole(role: string): role is OrganizationRole {
  return (ORGANIZATION_ROLES as readonly string[]).includes(role)
}

export function hasOrganizationCapability(
  role: OrganizationRole,
  capability: OrganizationCapability
): boolean {
  return ROLE_CAPABILITIES[role].includes(capability)
}

export function assertOrganizationCapability(
  role: OrganizationRole,
  capability: OrganizationCapability
): void {
  if (!hasOrganizationCapability(role, capability)) {
    throw new Error('FORBIDDEN')
  }
}

export function canManageOperations(role: OrganizationRole): boolean {
  return hasOrganizationCapability(role, 'operations.manage')
}

export function canViewEconomics(role: OrganizationRole): boolean {
  return hasOrganizationCapability(role, 'economics.read')
}

export function canManageEconomics(role: OrganizationRole): boolean {
  return hasOrganizationCapability(role, 'economics.manage')
}

export function canPublishEconomics(role: OrganizationRole): boolean {
  return hasOrganizationCapability(role, 'economics.publish')
}
