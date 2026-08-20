'use client'

/**
 * Opens the single Supabase Realtime connection the dashboard shares.
 *
 * Mounted once in src/app/(dashboard)/layout.tsx. Every row change on a watched
 * table, scoped to this organization, is fanned out through the registry to the
 * components that asked for it (LiveRefresh, useLiveRefresh, useLiveRefreshEvent).
 *
 * Scoping is server-enforced twice over: the `organization_id=eq.<org>` filter
 * keeps other tenants' events off the wire, and Realtime still applies RLS on
 * top, so a row the signed-in user could not SELECT is never delivered. The
 * filter is an optimisation; RLS is the security boundary.
 *
 * The connection is keyed to `orgId` alone, so client-side navigation reuses it
 * rather than tearing down and re-opening a websocket on every page change.
 */

import { createContext, useEffect, useState, type ReactNode } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { WATCHED_TABLES, createRegistry, type LiveRefreshRegistry } from './registry'

export const LiveRefreshContext = createContext<LiveRefreshRegistry | null>(null)

export function LiveRefreshProvider({
  orgId,
  children,
}: {
  orgId: string | null
  children: ReactNode
}) {
  // One registry for the lifetime of the provider. Listeners come and go with
  // the components that own them; the registry itself must not be recreated on
  // render or every subscription would be silently dropped. A lazy useState
  // initializer gives that stable identity without reading a ref during render.
  const [registry] = useState<LiveRefreshRegistry>(createRegistry)

  useEffect(() => {
    // A superadmin has no org, and the layout renders before the profile
    // resolves. Both are "nothing to subscribe to" rather than an error.
    if (!orgId) return

    const supabase = createClient()
    let channel: RealtimeChannel | null = supabase.channel(`live-refresh:${orgId}`)

    // Every listener has to be attached before subscribe() — the Realtime
    // client will not accept new bindings on an already-joined channel, which
    // is why WATCHED_TABLES is a fixed list rather than built from whatever
    // happens to be mounted.
    for (const table of WATCHED_TABLES) {
      channel = channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
          filter: `organization_id=eq.${orgId}`,
        },
        () => registry.dispatch(table)
      )
    }

    channel.subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        // Not fatal: every consumer either has its own fallback poll or is a
        // convenience refresh. Log rather than surface it to the user.
        console.warn('[realtime] live refresh unavailable', { status })
      }
    })

    return () => {
      const open = channel
      channel = null
      if (open) void supabase.removeChannel(open)
    }
  }, [orgId, registry])

  return <LiveRefreshContext.Provider value={registry}>{children}</LiveRefreshContext.Provider>
}
