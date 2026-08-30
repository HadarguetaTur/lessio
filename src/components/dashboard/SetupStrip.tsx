'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { CheckCircle2, ChevronDown, ChevronUp, Circle, Rocket } from 'lucide-react'

export type SetupGap = 'teacher' | 'students' | 'lesson' | 'whatsapp' | 'payment'

const HREFS: Record<SetupGap, string> = {
  teacher: '/teachers',
  students: '/students/import',
  lesson: '/lessons/new',
  whatsapp: '/settings/whatsapp',
  payment: '/settings/payment',
}

const ORDER: SetupGap[] = ['teacher', 'students', 'lesson', 'whatsapp', 'payment']

interface Props {
  orgId: string
  missing: SetupGap[]
  completed: number
  total: number
  isRtl?: boolean
}

export function SetupStrip({ missing, completed, total }: Props) {
  const t = useTranslations('dashboard.setup')
  const [expanded, setExpanded] = useState(true)
  const missingSet = new Set(missing)
  const percent = Math.round((completed / total) * 100)

  return (
    <section className="rounded-2xl border border-violet-200 bg-gradient-to-l from-violet-50 via-card to-teal-50 p-5 shadow-sm">
      <button type="button" onClick={() => setExpanded((value) => !value)} className="flex w-full items-start justify-between gap-4 text-start">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white shadow-sm">
            <Rocket size={19} aria-hidden />
          </span>
          <div>
            <h2 className="font-semibold text-foreground">{t('title')}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{t('progress', { completed, total })}</p>
          </div>
        </div>
        {expanded ? <ChevronUp size={18} className="mt-2 text-muted-foreground" /> : <ChevronDown size={18} className="mt-2 text-muted-foreground" />}
      </button>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/80 ring-1 ring-border/50">
        <div className="h-full rounded-full bg-gradient-to-l from-teal-500 to-violet-600 transition-[width]" style={{ width: `${percent}%` }} />
      </div>

      {expanded && (
        <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {ORDER.map((item) => {
            const isMissing = missingSet.has(item)
            return (
              <li key={item}>
                {isMissing ? (
                  <Link href={HREFS[item]} className="flex h-full items-start gap-2.5 rounded-xl border border-border bg-card px-3 py-3 text-sm transition-colors hover:border-violet-300 hover:bg-violet-50/60">
                    <Circle size={16} className="mt-0.5 shrink-0 text-violet-500" />
                    <span>
                      <span className="block font-medium text-foreground">{t(`items.${item}.title`)}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{t(`items.${item}.description`)}</span>
                    </span>
                  </Link>
                ) : (
                  <div className="flex h-full items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-3 text-sm">
                    <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                    <span className="font-medium text-emerald-800">{t(`items.${item}.title`)}</span>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
