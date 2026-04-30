'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

type LandingRevealProps = {
  children: ReactNode
  className?: string
  /** Extra classes when visible (tw-animate enter utilities). */
  visibleClassName?: string
  threshold?: number
  rootMargin?: string
  /** Preset enter animation (tw-animate-css). */
  variant?: 'fade-up' | 'zoom' | 'blur' | 'from-start'
}

const VARIANT_VISIBLE: Record<NonNullable<LandingRevealProps['variant']>, string> = {
  'fade-up':
    'animate-in fade-in slide-in-from-bottom-10 duration-700 ease-out fill-mode-forwards motion-reduce:animate-none motion-reduce:opacity-100 motion-reduce:translate-y-0',
  zoom: 'animate-in fade-in zoom-in-95 slide-in-from-bottom-8 duration-800 ease-out fill-mode-forwards motion-reduce:animate-none motion-reduce:opacity-100 motion-reduce:translate-y-0',
  blur: 'animate-in fade-in blur-in slide-in-from-bottom-6 duration-900 ease-out fill-mode-forwards motion-reduce:animate-none motion-reduce:opacity-100 motion-reduce:translate-y-0',
  'from-start':
    'animate-in fade-in slide-in-from-start-8 duration-700 ease-out fill-mode-forwards motion-reduce:animate-none motion-reduce:opacity-100 motion-reduce:translate-x-0',
}

/**
 * Reveals children when scrolled into view using tw-animate-css enter utilities.
 */
export function LandingReveal({
  children,
  className,
  visibleClassName,
  threshold = 0.12,
  rootMargin = '0px 0px -8% 0px',
  variant = 'fade-up',
}: LandingRevealProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true)
          obs.disconnect()
        }
      },
      { threshold, rootMargin }
    )

    obs.observe(el)
    return () => obs.disconnect()
  }, [threshold, rootMargin])

  return (
    <div
      ref={ref}
      className={cn(
        !visible && 'opacity-0',
        visible && VARIANT_VISIBLE[variant],
        visible && visibleClassName,
        className
      )}
    >
      {children}
    </div>
  )
}
