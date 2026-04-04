/**
 * Superadmin session helpers.
 * Thin re-export so admin modules import from a consistent path.
 * Server-only. Never import from client components.
 *
 * Per /docs/sprint-18-scope.md § Story 0.
 */

export { requireSuperAdminSession } from '@/lib/auth/session'
export type { SuperAdminSession } from '@/lib/auth/session'
