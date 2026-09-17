'use client'

import { useEffect } from 'react'

/**
 * Keeps a Clarity recording from following the visitor off the marketing pages.
 *
 * See ClarityScript: there is no documented way to stop Clarity, so leaving the
 * allowed pages must be a real page load. Rendered only when Clarity is.
 */
export function ClarityGuard({ allowedPaths }: { allowedPaths: readonly string[] }) {
  useEffect(() => {
    const isAllowed = (pathname: string) => allowedPaths.includes(pathname)

    // Every link out becomes a document navigation instead of a soft one.
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const anchor = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!anchor || anchor.target === '_blank') return

      let url: URL
      try {
        url = new URL(anchor.href, window.location.href)
      } catch {
        return
      }
      if (url.origin !== window.location.origin || isAllowed(url.pathname)) return

      e.preventDefault()
      e.stopPropagation()
      window.location.assign(url.href)
    }
    // Capture on the document runs before Next's <Link> handler. stopPropagation
    // does not silence the other capture listener on this same node, so
    // LandingTracker still records the CTA click.
    document.addEventListener('click', onClick, { capture: true })

    return () => {
      document.removeEventListener('click', onClick, { capture: true })
      // Anything that still got out softly (back/forward, a programmatic push):
      // reload where we landed. The pathname check keeps React's dev-mode
      // double-invoke, which unmounts without navigating, from reloading.
      if (!isAllowed(window.location.pathname)) window.location.reload()
    }
  }, [allowedPaths])

  return null
}
