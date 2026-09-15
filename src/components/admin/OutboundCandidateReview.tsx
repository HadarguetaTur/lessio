'use client'

import { useActionState, useMemo, useState } from 'react'
import { Check, Loader2, Search } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { DiscoveryCandidate } from '@/lib/outbound/discovery'
import type { OutboundActionState } from '@/app/(admin)/admin/outbound/actions'

type Action = (prev: OutboundActionState | null, formData: FormData) => Promise<OutboundActionState>

export function OutboundCandidateReview({
  candidates,
  discoverAction,
  approveAction,
}: {
  candidates: DiscoveryCandidate[]
  discoverAction: Action
  approveAction: Action
}) {
  const [selected, setSelected] = useState<string[]>([])
  const [discoverState, discover, discovering] = useActionState(discoverAction, null)
  const [approveState, approve, approving] = useActionState(approveAction, null)
  const selectedSet = useMemo(() => new Set(selected), [selected])
  const selectable = candidates.filter((candidate) => candidate.email && candidate.personal_line && candidate.opener_status === 'generated')

  function toggle(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]))
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">מועמדים לאישור</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            כל שורה מבוססת על עסק ציבורי ואתר העסק. אישור מעביר אותה לתור בקשת הרשות בלבד, עם המשפט האישי המוצג כאן.
          </p>
        </div>
        <form action={discover}>
          <Button type="submit" variant="outline" disabled={discovering}>
            {discovering ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
            איסוף עד 50 מועמדים
          </Button>
        </form>
      </div>

      {discoverState?.error && <p className="mt-3 text-xs text-destructive">לא הצלחנו לאסוף מועמדים כרגע.</p>}
      {discoverState?.ok && <p className="mt-3 text-xs text-emerald-700">האיסוף הסתיים. {discoverState.detail ?? 0} מועמדים מוכנים לבדיקה.</p>}

      {selectable.length > 0 && (
        <form action={approve} className="mt-5 flex flex-wrap items-center gap-3 rounded-lg bg-muted/50 p-3">
          <input type="hidden" name="candidateIds" value={JSON.stringify(selected)} />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={selected.length > 0 && selected.length === selectable.length}
              onChange={(event) => setSelected(event.target.checked ? selectable.map((candidate) => candidate.id) : [])}
            />
            לבחור את כל המועמדים המוכנים ({selectable.length})
          </label>
          <Button type="submit" disabled={selected.length === 0 || approving}>
            {approving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
            אישור ושליחה לתור ({selected.length})
          </Button>
          {approveState?.error && <span className="text-xs text-destructive">האישור לא נשמר. נסו שוב.</span>}
          {approveState?.ok && <span className="text-xs text-emerald-700">{approveState.detail ?? 0} מועמדים נוספו לתור.</span>}
        </form>
      )}

      {candidates.length === 0 ? (
        <p className="mt-5 text-sm text-muted-foreground">אין עדיין מועמדים עם כתובת מייל ציבורית ומשפט אישי לבדיקה.</p>
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {candidates.map((candidate) => {
            const ready = Boolean(candidate.email && candidate.personal_line && candidate.opener_status === 'generated')
            return (
              <li key={candidate.id} className="flex gap-3 py-4">
                <input
                  aria-label={`אישור ${candidate.business_name}`}
                  type="checkbox"
                  className="mt-1"
                  disabled={!ready}
                  checked={selectedSet.has(candidate.id)}
                  onChange={() => toggle(candidate.id)}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <p className="font-medium">{candidate.business_name}</p>
                    {candidate.source_url && (
                      <a href={candidate.source_url} target="_blank" rel="noreferrer noopener" className="text-xs text-muted-foreground underline" dir="ltr">
                        אתר המקור
                      </a>
                    )}
                  </div>
                  <p className="mt-1 font-mono text-xs text-muted-foreground" dir="ltr">{candidate.email ?? 'לא נמצאה כתובת מייל ציבורית'}</p>
                  {candidate.personal_line ? (
                    <p className="mt-2 rounded-md bg-muted px-3 py-2 text-sm">{candidate.personal_line}</p>
                  ) : (
                    <p className="mt-2 text-xs text-amber-700">עדיין אין מספיק מידע לכתיבת משפט אישי.</p>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
