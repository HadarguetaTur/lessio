'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronDown } from 'lucide-react'

import { cn } from '@/lib/utils'

type LandingProcessStepsProps = {
  steps: readonly string[]
  dir: 'rtl' | 'ltr'
}

/**
 * Reveals process steps one after another when in view (respects reduced motion).
 */
export function LandingProcessSteps({ steps, dir }: LandingProcessStepsProps) {
  const t = useTranslations('legal')
  const containerRef = useRef<HTMLOListElement | null>(null)
  const [inView, setInView] = useState(false)
  const [visibleCount, setVisibleCount] = useState(0)
  const [reduceMotion, setReduceMotion] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduceMotion(mq.matches)
    const onChange = () => setReduceMotion(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setInView(true)
          obs.disconnect()
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -6% 0px' }
    )

    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    if (!inView) return
    if (reduceMotion) {
      setVisibleCount(steps.length)
      return
    }
    if (visibleCount >= steps.length) return

    const delay = visibleCount === 0 ? 280 : 820
    const t = window.setTimeout(() => {
      setVisibleCount((c) => c + 1)
    }, delay)

    return () => window.clearTimeout(t)
  }, [inView, reduceMotion, visibleCount, steps.length])

  return (
    <ol
      ref={containerRef}
      className="mt-8 list-none space-y-0 ps-0"
      dir={dir}
      aria-label={t('processAria')}
    >
      {steps.map((text, i) => {
        const shown = reduceMotion ? true : i < visibleCount
        const allDone = reduceMotion || visibleCount >= steps.length
        const active =
          !reduceMotion && !allDone && i === visibleCount - 1 && visibleCount > 0

        return (
          <li key={i} className="relative">
            <div
              className={cn(
                'flex gap-3 rounded-xl border bg-card/40 px-4 py-3.5 text-start transition-all duration-700 ease-out sm:gap-4 sm:px-5 sm:py-4',
                shown
                  ? 'translate-y-0 border-border/70 opacity-100 shadow-sm'
                  : 'pointer-events-none translate-y-3 border-transparent opacity-0',
                active && 'border-teal-500/35 ring-1 ring-teal-500/15'
              )}
            >
              <span
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums transition-colors duration-500',
                  shown
                    ? active
                      ? 'bg-gradient-to-br from-teal-500 to-violet-600 text-white shadow-md shadow-teal-500/20'
                      : 'bg-teal-500/15 text-teal-800 dark:text-teal-200'
                    : 'bg-muted text-transparent'
                )}
                aria-hidden
              >
                {i + 1}
              </span>
              <p className="min-w-0 flex-1 text-pretty text-sm leading-relaxed text-foreground/90 sm:text-[0.95rem]">
                {text}
              </p>
            </div>
            {i < steps.length - 1 ? (
              <div
                className={cn(
                  'flex justify-center py-1.5 transition-opacity duration-500',
                  !reduceMotion && i + 1 < visibleCount ? 'opacity-100' : reduceMotion ? 'opacity-100' : 'opacity-0'
                )}
                aria-hidden
              >
                <ChevronDown
                  className={cn(
                    'size-5 text-teal-500/45 motion-safe:animate-pulse motion-reduce:animate-none',
                    active && 'text-teal-600/70'
                  )}
                />
              </div>
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}
