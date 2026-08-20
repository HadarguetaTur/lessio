'use client'

/**
 * Drop-in live refresh for a server-rendered page.
 *
 *   <LiveRefresh tables={['charges']} />
 *
 * Renders nothing. It exists so a server component — which cannot call hooks —
 * can still opt into live updates by placing one element in its tree, rather
 * than being converted into a client component for the sake of a subscription.
 */

import { useLiveRefresh } from './useLiveRefresh'

export function LiveRefresh({ tables }: { tables: readonly string[] }) {
  useLiveRefresh(tables)
  return null
}
