/**
 * Writes one row to the error feed — Sprint 32 M3.
 *
 * Contract: never throws, never blocks anything the user is waiting for. This
 * runs inside error handling, so a failure here would replace a real error with
 * a confusing one.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { fingerprintError } from './fingerprint'

/** Stacks are for reading, not archiving — a runaway recursion can be megabytes. */
const STACK_MAX = 8_000
const MESSAGE_MAX = 2_000

export interface ReportErrorInput {
  name?: string | null
  message?: string | null
  stack?: string | null
  route?: string | null
  digest?: string | null
  source: 'server' | 'client' | 'edge'
  organizationId?: string | null
  url?: string | null
  userAgent?: string | null
}

export async function reportError(input: ReportErrorInput): Promise<void> {
  try {
    const db = createServiceRoleClient()

    const { error } = await db.from('error_events').insert({
      fingerprint: fingerprintError(input),
      name: input.name ?? null,
      message: input.message?.slice(0, MESSAGE_MAX) ?? null,
      route: input.route ?? null,
      digest: input.digest ?? null,
      source: input.source,
      organization_id: input.organizationId ?? null,
      url: input.url?.slice(0, 1000) ?? null,
      user_agent: input.userAgent?.slice(0, 300) ?? null,
      stack: input.stack?.slice(0, STACK_MAX) ?? null,
    })

    if (error) {
      console.error('[telemetry] Failed to record error event', { error: error.message })
    }
  } catch (err) {
    // Deliberately swallowed: see the contract above.
    console.error('[telemetry] Unexpected error recording error event', { err: String(err) })
  }
}

/** Pulls the reportable shape out of an unknown thrown value. */
export function describeThrown(thrown: unknown): {
  name: string
  message: string
  stack: string | null
  digest: string | null
} {
  if (thrown instanceof Error) {
    return {
      name: thrown.name,
      message: thrown.message,
      stack: thrown.stack ?? null,
      digest: (thrown as Error & { digest?: string }).digest ?? null,
    }
  }

  return { name: 'NonError', message: String(thrown), stack: null, digest: null }
}
