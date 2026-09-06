/**
 * Edge-function error reporting — the Deno side of the Sprint 32 M3 error feed.
 *
 * The feed, its fingerprinting and the hourly promotion into a dev_issue were
 * all built with `source: 'edge'` in the schema, but nothing in
 * supabase/functions/ ever wrote a row. A cron that failed — a decryption that
 * broke, a Meta token that expired, a query that started erroring — looked
 * exactly like a cron that had nothing to do. This closes that.
 *
 * Contract, mirrored from the Node side: never throws. This runs inside error
 * handling, so a failure here must not replace a real error with a confusing
 * one.
 */

// deno-lint-ignore-file no-explicit-any

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getSupabaseSecretKey } from './supabaseSecret.ts'
import { fingerprintError } from './errorFingerprint.ts'

const STACK_MAX = 8_000
const MESSAGE_MAX = 2_000

/** Pulls the reportable shape out of an unknown thrown value. */
export function describeThrown(thrown: unknown): {
  name: string
  message: string
  stack: string | null
} {
  if (thrown instanceof Error) {
    return { name: thrown.name, message: thrown.message, stack: thrown.stack ?? null }
  }
  return { name: 'NonError', message: String(thrown), stack: null }
}

/**
 * Records one edge failure on the error feed.
 *
 * `route` is the function name, which is what makes a group actionable: it is
 * the difference between "something threw" and "homework-sender threw".
 */
export async function reportEdgeError(
  db: any,
  input: {
    thrown: unknown
    /** The function name, e.g. 'homework-sender'. */
    route: string
    organizationId?: string | null
  }
): Promise<void> {
  try {
    const { name, message, stack } = describeThrown(input.thrown)

    const { error } = await db.from('error_events').insert({
      fingerprint: await fingerprintError({ name, message, route: input.route }),
      name,
      message: message.slice(0, MESSAGE_MAX),
      route: input.route,
      source: 'edge',
      organization_id: input.organizationId ?? null,
      stack: stack?.slice(0, STACK_MAX) ?? null,
    })

    if (error) {
      console.error('[telemetry] Failed to record edge error event', {
        route: input.route,
        error: error.message,
      })
    }
  } catch (err) {
    // Deliberately swallowed: see the contract at the top of this file.
    console.error('[telemetry] Unexpected error recording edge error event', {
      route: input.route,
      err: String(err),
    })
  }
}

/**
 * Registers a cron handler whose unhandled throws reach the error feed.
 *
 * The per-org catches inside these functions cover the failures they
 * anticipated. This covers the ones they did not — a bad env var, a schema
 * change, a throw in the setup before the loop — which is exactly the class
 * that used to end as a 500 nobody read.
 *
 * It builds its own client rather than taking one, because the throw it is
 * most useful for is the one that happens before a client exists.
 */
export function serveWithErrorReporting(
  route: string,
  handler: (req: Request) => Promise<Response>
): void {
  Deno.serve(async (req: Request) => {
    try {
      return await handler(req)
    } catch (err) {
      console.error(`[${route}] Unhandled failure`, { error: String(err) })
      try {
        const db = createClient(Deno.env.get('SUPABASE_URL')!, getSupabaseSecretKey())
        await reportEdgeError(db, { thrown: err, route })
      } catch (reportErr) {
        console.error(`[${route}] Could not record the failure`, { err: String(reportErr) })
      }
      return new Response('error', { status: 500 })
    }
  })
}
