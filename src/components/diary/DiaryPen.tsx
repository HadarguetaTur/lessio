'use client'

import { useEffect } from 'react'

/**
 * The page's one authored motion: the pen writes.
 *
 * Every element carrying data-pen gets .is-on the first time it scrolls into
 * view; landing-diary.css draws the red strike, sweeps the highlighter and
 * inks the notes from that class. Nothing else on the page animates on
 * scroll. Reduced motion is handled in CSS (final state, no animation), so
 * this only ever toggles a class.
 *
 * Also keeps the thumb index (.tabs) pointing at the page in view.
 */
export function DiaryPen({ scrollRootId }: { scrollRootId: string }) {
  useEffect(() => {
    const root = document.getElementById(scrollRootId)
    const pens = Array.from(document.querySelectorAll<HTMLElement>('[data-pen]'))
    const penObs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-on')
            penObs.unobserve(entry.target)
          }
        }
      },
      { root, threshold: 0.45 }
    )
    pens.forEach((el) => penObs.observe(el))

    const tabs = Array.from(document.querySelectorAll<HTMLAnchorElement>('.tabs a[href^="#"]'))
    const pages = tabs
      .map((a) => document.getElementById(a.getAttribute('href')!.slice(1)))
      .filter((el): el is HTMLElement => el != null)
    const scroller = root ?? document.documentElement
    let raf = 0
    const mark = () => {
      raf = 0
      const line = (root ? root.getBoundingClientRect().top : 0) + scroller.clientHeight * 0.4
      let current: HTMLElement | null = null
      for (const el of pages) if (el.getBoundingClientRect().top <= line) current = el
      for (const a of tabs) {
        if (current && a.getAttribute('href') === `#${current.id}`) a.setAttribute('aria-current', 'true')
        else a.removeAttribute('aria-current')
      }
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(mark)
    }
    const target: HTMLElement | Window = root ?? window
    target.addEventListener('scroll', onScroll, { passive: true })
    mark()

    return () => {
      penObs.disconnect()
      target.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [scrollRootId])

  return null
}
