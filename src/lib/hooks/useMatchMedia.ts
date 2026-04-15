'use client'

import { useSyncExternalStore } from 'react'

/**
 * Subscribes to a CSS media query (client-only). SSR snapshot is `false`.
 */
export function useMatchMedia(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(query)
      mq.addEventListener('change', onChange)
      return () => mq.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}
