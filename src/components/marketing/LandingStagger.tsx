'use client'

import {
  Children,
  cloneElement,
  createElement,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'

import { cn } from '@/lib/utils'

const STAGGER_BASE =
  'motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-6 motion-safe:zoom-in-95 motion-safe:duration-700 motion-safe:ease-out motion-safe:fill-mode-both motion-reduce:animate-none motion-reduce:opacity-100 motion-reduce:translate-y-0'

type LandingStaggerProps = {
  children: ReactNode
  className?: string
  as?: 'div' | 'ul'
  /** ms between each child */
  stepMs?: number
  threshold?: number
  rootMargin?: string
}

/**
 * When scrolled into view, animates direct children in sequence (tw-animate-css).
 * Injects className + animationDelay via cloneElement — use only with elements that accept them (e.g. li, div).
 */
export function LandingStagger({
  children,
  className,
  as: Tag = 'div',
  stepMs = 85,
  threshold = 0.08,
  rootMargin = '0px 0px -6% 0px',
}: LandingStaggerProps) {
  const ref = useRef<HTMLDivElement | HTMLUListElement | null>(null)
  const [on, setOn] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setOn(true)
          obs.disconnect()
        }
      },
      { threshold, rootMargin }
    )

    obs.observe(el)
    return () => obs.disconnect()
  }, [threshold, rootMargin])

  const mapped = Children.map(children, (child, i) => {
    if (!isValidElement(child)) return child
    const el = child as ReactElement<{ className?: string; style?: React.CSSProperties }>
    const delay = on ? Math.min(i, 12) * stepMs : 0
    return cloneElement(el, {
      className: cn(!on && 'opacity-0', on && STAGGER_BASE, el.props.className),
      style: {
        ...el.props.style,
        ...(on ? { animationDelay: `${delay}ms` } : undefined),
      },
    })
  })

  return createElement(Tag, { ref, className }, mapped)
}
