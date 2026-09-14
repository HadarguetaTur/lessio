'use client'

import { useState, type ReactNode, type SyntheticEvent } from 'react'
import { ChevronRight } from 'lucide-react'

interface ChartPanelProps {
  title: string
  defaultOpen: boolean
  children: ReactNode
}

/**
 * A collapsible card for a report chart.
 *
 * The children mount only while the panel is open: recharts' ResponsiveContainer
 * warns about a 0×0 container when it measures inside a closed <details>, and
 * skipping the mount also means the recharts chunk is not fetched until the
 * reader actually asks for the chart.
 */
export function ChartPanel({ title, defaultOpen, children }: ChartPanelProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <details
      className="group shrink-0 rounded-xl border border-border bg-card shadow-sm"
      open={defaultOpen}
      onToggle={(e: SyntheticEvent<HTMLDetailsElement>) => setOpen(e.currentTarget.open)}
    >
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-foreground marker:content-none sm:px-6">
        <span className="flex items-center gap-1.5">
          <ChevronRight
            size={16}
            className="shrink-0 text-muted-foreground transition-transform group-open:rotate-90 rtl:-scale-x-100"
          />
          {title}
        </span>
      </summary>
      {open && <div className="border-t border-border p-4 sm:p-6">{children}</div>}
    </details>
  )
}
