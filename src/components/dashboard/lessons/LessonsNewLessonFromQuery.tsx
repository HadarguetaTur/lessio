'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useLessonScheduleSheet } from './LessonScheduleSheetProvider'

/** When URL contains `openNewLesson=1`, opens the new-lesson sheet and strips the param. */
export function LessonsNewLessonFromQuery() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const { openNewLessonFromHeader } = useLessonScheduleSheet()
  const handledRef = useRef(false)

  useEffect(() => {
    if (searchParams.get('openNewLesson') !== '1') {
      handledRef.current = false
      return
    }
    if (handledRef.current) return
    handledRef.current = true
    openNewLessonFromHeader()
    const next = new URLSearchParams(searchParams.toString())
    next.delete('openNewLesson')
    const q = next.toString()
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false })
  }, [searchParams, pathname, router, openNewLessonFromHeader])

  return null
}
