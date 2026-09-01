/**
 * What each platform staff role is allowed to do.
 *
 * Per /docs/sprint-34-scope.md § B. Pure data and pure functions — no DB, no
 * session — so the matrix can be tested directly and imported by both the
 * isomorphic navigation registry and the server-side guards.
 *
 * Until now `profiles.role = 'superadmin'` was necessary *and sufficient* to
 * reply to a support ticket, and the same predicate also changed any org's
 * plan, cancelled subscriptions, exported tenant data and entered support mode.
 * There was no separation at all.
 *
 * The capability names deliberately follow the `AdminAuditAction` union in
 * ./audit.ts, which was already an inventory of the privileged operations.
 */

/** Roles stored in `profiles.role` for org-less platform operators. */
export const PLATFORM_ROLES = [
  'superadmin',
  'platform_support',
  'platform_billing',
  'platform_marketing',
  'platform_viewer',
] as const

export type PlatformRole = (typeof PLATFORM_ROLES)[number]

export type PlatformCapability =
  /** See the tenant list and a tenant's record. */
  | 'orgs.read'
  /** Create a tenant, edit its settings, process a deletion request. */
  | 'orgs.write'
  /** Download a tenant's parents, students, lessons and charges. */
  | 'orgs.export'
  | 'support.read'
  | 'support.reply'
  /** Impersonate a tenant and browse its dashboard read-only. */
  | 'support_mode.enter'
  /** Subscriptions, invoices, plan prices — reading them. */
  | 'billing.read'
  /** Change a plan, extend a trial, set a status, cancel, edit plan pricing. */
  | 'billing.write'
  /** Leads, campaigns, attribution, tracking destinations — reading them. */
  | 'growth.read'
  | 'growth.write'
  /** Invite a colleague, change their role, deactivate them. */
  | 'staff.manage'
  | 'audit.read'

const ALL: PlatformCapability[] = [
  'orgs.read',
  'orgs.write',
  'orgs.export',
  'support.read',
  'support.reply',
  'support_mode.enter',
  'billing.read',
  'billing.write',
  'growth.read',
  'growth.write',
  'staff.manage',
  'audit.read',
]

/**
 * The matrix.
 *
 * Two edges are deliberate and were decided explicitly:
 *  - Only support and superadmin hold `support_mode.enter`. Reading a tenant's
 *    dashboard from the inside is the whole point of the support role and has
 *    no bearing on billing or marketing work.
 *  - Marketing holds no `orgs.read`. Its people work on leads and aggregate
 *    numbers and have no business seeing student or parent records — which is
 *    also why `is_platform_reader()` excludes the role at the RLS layer, not
 *    only here.
 */
export const ROLE_CAPABILITIES: Record<PlatformRole, PlatformCapability[]> = {
  superadmin: ALL,

  platform_support: [
    'orgs.read',
    'support.read',
    'support.reply',
    'support_mode.enter',
  ],

  platform_billing: ['orgs.read', 'billing.read', 'billing.write'],

  platform_marketing: ['growth.read', 'growth.write'],

  // Reads everything, changes nothing. For an investor, an accountant or an
  // analyst — and the safest default when a new colleague's remit is unclear.
  platform_viewer: [
    'orgs.read',
    'support.read',
    'billing.read',
    'growth.read',
    'audit.read',
  ],
}

export function isPlatformRole(role: string): role is PlatformRole {
  return (PLATFORM_ROLES as readonly string[]).includes(role)
}

export function capabilitiesFor(role: string): PlatformCapability[] {
  return isPlatformRole(role) ? ROLE_CAPABILITIES[role] : []
}

export function hasCapability(
  capabilities: readonly PlatformCapability[],
  required: PlatformCapability
): boolean {
  return capabilities.includes(required)
}

/**
 * Roles that keep the unscoped tenant SELECT policies added in
 * 20260824130000_superadmin_read_policies.sql. Mirrors `is_platform_reader()`
 * in SQL — if the two ever disagree, the UI shows a page whose queries return
 * nothing, which is the exact failure 20260824120000 was written to fix.
 */
export function isPlatformReader(role: string): boolean {
  return isPlatformRole(role) && role !== 'platform_marketing'
}
