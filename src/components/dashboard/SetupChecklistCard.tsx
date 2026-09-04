'use client'

import { useCallback, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { CheckCircle2, Circle, X } from 'lucide-react'

export interface SetupChecklistItem {
  key: string
  label: string
  href: string
  done: boolean
}

/**
 * "Finish setting up" card on the owner dashboard (UX audit 5, F5).
 *
 * The server renders it only while at least one item is missing, so the card
 * disappears on its own the day the studio is actually operational. The dismiss
 * button is for the owner who deliberately skips an item (e.g. never intends to
 * connect payments) — that choice is a browser convenience, kept in
 * localStorage, not a business fact, so it is per-device by design.
 */
export function SetupChecklistCard({
  title,
  progressLabel,
  dismissLabel,
  orgId,
  items,
}: {
  title: string
  progressLabel: string
  dismissLabel: string
  orgId: string
  items: SetupChecklistItem[]
}) {
  const storageKey = `lessio.setup-card-dismissed.${orgId}`
  const [dismissedNow, setDismissedNow] = useState(false)
  // Reading the stored dismissal through useSyncExternalStore keeps the server
  // render (always visible) and the client's first paint consistent without a
  // set-state-in-effect flash.
  const dismissedBefore = useSyncExternalStore(
    useCallback(() => () => {}, []),
    () => {
      try {
        return localStorage.getItem(storageKey) === '1'
      } catch {
        return false // storage unavailable — keep the card visible
      }
    },
    () => false
  )

  if (dismissedBefore || dismissedNow) return null

  return (
    <section
      aria-label={title}
      className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 sm:p-5"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{progressLabel}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setDismissedNow(true)
            try {
              localStorage.setItem(storageKey, '1')
            } catch {
              /* non-persistent dismiss is still a dismiss */
            }
          }}
          className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-blue-100 hover:text-foreground transition-colors"
        >
          <X size={13} aria-hidden />
          {dismissLabel}
        </button>
      </div>

      <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) =>
          item.done ? (
            <li
              key={item.key}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground"
            >
              <CheckCircle2 size={16} className="shrink-0 text-green-600" aria-hidden />
              <s className="decoration-muted-foreground/50">{item.label}</s>
            </li>
          ) : (
            <li key={item.key}>
              <Link
                href={item.href}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-blue-800 hover:bg-blue-100 transition-colors"
              >
                <Circle size={16} className="shrink-0 text-blue-400" aria-hidden />
                {item.label}
              </Link>
            </li>
          )
        )}
      </ul>
    </section>
  )
}
