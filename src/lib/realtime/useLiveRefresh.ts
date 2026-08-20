'use client'

/**
 * Hooks for reacting to live row changes on the shared Realtime connection.
 *
 *   useLiveRefresh(['lessons'])            → re-runs the server component tree
 *   useLiveRefreshEvent(['x'], callback)   → runs your own callback instead
 *
 * Both are no-ops outside LiveRefreshProvider (the portal, the marketing site,
 * a superadmin with no org). A missing provider means "no live updates here",
 * not a crash — the pages involved already render correct data on load.
 */

import { useCallback, useContext, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { LiveRefreshContext } from './LiveRefreshProvider'
import { coalesce } from './registry'

/** Burst window. Long enough to swallow a bulk write, short enough to feel live. */
const COALESCE_MS = 300

/**
 * Runs `callback` when any of `tables` changes in this organization.
 *
 * `tables` is compared by content, so the usual inline literal
 * (`useLiveRefreshEvent(['lessons'], cb)`) does not re-subscribe on every
 * render. `callback` is read through a ref for the same reason: an unstable
 * function identity would otherwise tear the subscription down and rebuild it
 * continuously.
 */
export function useLiveRefreshEvent(tables: readonly string[], callback: () => void): void {
  const registry = useContext(LiveRefreshContext)
  const key = tables.join(',')

  // Seeded with the first callback and refreshed after each render, so the
  // subscription below always calls the latest one without depending on its
  // identity.
  const callbackRef = useRef(callback)
  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  useEffect(() => {
    if (!registry) return

    const burst = coalesce(() => callbackRef.current(), COALESCE_MS)
    const unsubscribe = registry.add(key.split(',').filter(Boolean), burst.call)

    return () => {
      burst.cancel()
      unsubscribe()
    }
  }, [registry, key])
}

/**
 * Re-fetches the current route when any of `tables` changes.
 *
 * `router.refresh()` re-runs the server components and patches the result in
 * without touching client state or scroll position, so a table can update
 * underneath the user mid-scroll without yanking the page.
 */
export function useLiveRefresh(tables: readonly string[]): void {
  const router = useRouter()
  const refresh = useCallback(() => router.refresh(), [router])
  useLiveRefreshEvent(tables, refresh)
}
