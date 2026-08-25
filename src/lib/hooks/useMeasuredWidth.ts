'use client'

import { useEffect, useRef, useState, type RefObject } from 'react'

/**
 * Measures an element's content width, for charts that need a real pixel width.
 *
 * recharts' ResponsiveContainer measures itself on mount, before layout has
 * settled, and logs "The width(-1) and height(-1) of chart should be greater
 * than 0" on every load. Rendering the chart only once we have a width keeps
 * the console clean and the chart correctly sized.
 *
 * Returns 0 until measured — render a placeholder of the intended height so the
 * layout does not jump.
 */
export function useMeasuredWidth<T extends HTMLElement = HTMLDivElement>(): [
  RefObject<T | null>,
  number,
] {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const apply = () => setWidth(el.clientWidth)
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return [ref, width]
}
