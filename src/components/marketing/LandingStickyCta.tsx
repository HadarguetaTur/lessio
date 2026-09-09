'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

import { cn } from '@/lib/utils'

/**
 * Mobile-only sticky CTA bar. Appears once the hero (which carries the same
 * CTA) has scrolled out of view and stays reachable for the rest of the page —
 * on mobile the pricing cards are many screens away.
 *
 * Visibility is observed on the hero element rather than window.scrollY: the
 * root <body> is overflow-hidden and the landing wrapper is the scroll
 * container, so the window never scrolls.
 */
export function LandingStickyCta({
  href,
  label,
  note,
}: {
  href: string
  label: string
  note: string
}) {
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const hero = document.getElementById('landing-hero')
    if (!hero) return
    const obs = new IntersectionObserver(([entry]) => {
      setShown(!entry?.isIntersecting)
    })
    obs.observe(hero)
    return () => obs.disconnect()
  }, [])

  return (
    <div
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md transition-[transform,opacity] duration-300 sm:hidden',
        shown ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-full opacity-0'
      )}
    >
      <Link
        href={href}
        data-cta="sticky-mobile"
        className="flex h-12 w-full items-center justify-center rounded-xl bg-gradient-to-l from-teal-600 via-emerald-600 to-violet-600 text-base font-semibold text-white shadow-md shadow-teal-600/20"
      >
        {label}
      </Link>
      <p className="mt-1.5 text-center text-[0.7rem] text-muted-foreground">{note}</p>
    </div>
  )
}
