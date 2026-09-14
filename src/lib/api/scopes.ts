/**
 * API key scopes — dependency-free on purpose.
 *
 * `src/lib/api/keys.ts` imports Node's `crypto`; a client component that
 * pulled `API_SCOPES` from there dragged a 400 KB crypto polyfill into the
 * browser bundle. Anything the UI needs lives here instead.
 */

export type ApiScope = 'read' | 'write' | 'messages:send'

export const API_SCOPES: readonly ApiScope[] = ['read', 'write', 'messages:send'] as const

export function isApiScope(value: string): value is ApiScope {
  return (API_SCOPES as readonly string[]).includes(value)
}
