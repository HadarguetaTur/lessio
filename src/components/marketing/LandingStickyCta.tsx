'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

import { cn } from '@/lib/utils'

/**
 * Mobile-only sticky action strip. Appears once the hero (which carries the
 * same action) has scrolled out of view. Visibility is observed on the hero
 * rather than window.scrollY: the root <body> is overflow-hidden and the
 * diary wrapper is the scroll container, so the window never scrolls.
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
    const hero = document.getElementById('week')
    if (!hero) return
    const obs = new IntersectionObserver(([entry]) => {
      setShown(!entry?.isIntersecting)
    })
    obs.observe(hero)
    return () => obs.disconnect()
  }, [])

  return (
    <aside
      aria-label={label}
      className={cn(
        'rule-t fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-3 bg-[color:var(--paper)] px-4 pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-2.5 transition-[transform,opacity] duration-300 sm:hidden',
        shown ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-full opacity-0'
      )}
    >
      <p className="min-w-0 text-[0.7rem] leading-snug text-[color:var(--ink-2)]">{note}</p>
      <Link href={href} data-cta="sticky-mobile" className="hl-cta shrink-0 !text-[1.15rem]">
        {label}
      </Link>
    </aside>
  )
}
