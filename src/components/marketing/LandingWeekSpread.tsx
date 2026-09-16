import { cn } from '@/lib/utils'
import type { LandingContent } from '@/lib/marketing/landingCopy'

const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22] as const

/**
 * The hero: a teacher's week spread, hours down the reading-start side, five
 * day columns in reading order. One entry is the story; when the spread
 * scrolls into view the pen strikes it, prices it in the margin and marks the
 * slot free. Server-rendered; motion is a class toggled by LandingPen.
 */
export function LandingWeekSpread({
  diary,
  className,
}: {
  diary: LandingContent['hero']['diary']
  className?: string
}) {
  const byCell = new Map<string, (typeof diary.entries)[number]>()
  for (const e of diary.entries) byCell.set(`${e.day}-${e.hour}`, e)

  return (
    <div className={cn('spread', className)} role="img" aria-label={diary.synthetic} data-pen>
      {/* Column heads */}
      <div className="dayhead" aria-hidden />
      {diary.days.map((d) => (
        <div key={d.date} className="dayhead">
          <span className="display block text-[0.95rem] sm:text-lg">{d.name}</span>
          <span className="tabular block text-[0.62rem] text-[color:var(--ink-3)] sm:text-xs">{d.date}</span>
        </div>
      ))}

      {HOURS.map((h) => (
        <HourRow key={h} hour={h} diary={diary} byCell={byCell} />
      ))}
    </div>
  )
}

function HourRow({
  hour,
  diary,
  byCell,
}: {
  hour: number
  diary: LandingContent['hero']['diary']
  byCell: Map<string, (typeof diary.entries)[number]>
}) {
  return (
    <>
      <div className="hour" data-hour={hour}>
        {String(hour).padStart(2, '0')}:00
      </div>
      {diary.days.map((_, dayIndex) => {
        const entry = byCell.get(`${dayIndex}-${hour}`)
        if (!entry) return <div key={dayIndex} className="cell" data-hour={hour} />
        if (!entry.story) {
          return (
            <div key={dayIndex} className="cell" data-hour={hour}>
              <span className="entry">{entry.text}</span>
            </div>
          )
        }
        return (
          <div key={dayIndex} className="cell" data-hour={hour} style={{ overflow: 'visible', zIndex: 2 }}>
            <span className="entry entry-story relative">
              {entry.text}
              <svg className="strike" viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden>
                <path pathLength={1} d="M2 11 C 20 9, 40 13, 60 10 S 90 9, 98 11" vectorEffect="non-scaling-stroke" />
              </svg>
            </span>
            <span className="after-note pen ms-2 hidden whitespace-nowrap text-[1.1rem] text-[color:var(--ink-3)] sm:inline-block">
              {diary.freedNote}
            </span>
            <span
              className="sweep pen absolute -start-1 z-10 whitespace-nowrap text-[1rem] sm:text-[1.35rem]"
              style={{ display: 'inline-block', top: 'calc(var(--line) + 0.2rem)' }}
            >
              <span>{diary.marginNote}</span>
            </span>
          </div>
        )
      })}
    </>
  )
}
