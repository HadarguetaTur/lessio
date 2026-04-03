/**
 * KPI metric card for the dashboard.
 * Server component — no client-side state.
 * Per /docs/sprint-9-scope.md § Story 3.
 */

import { type LucideIcon } from 'lucide-react'

export function KpiCard({
  label,
  value,
  highlight,
  icon: Icon,
}: {
  label: string
  value: string | number
  highlight?: boolean
  icon?: LucideIcon
}) {
  const iconClass = highlight
    ? 'bg-amber-50 text-amber-400'
    : 'bg-gray-50 text-gray-400'

  return (
    <div
      className={`bg-white rounded-xl shadow-sm flex items-center justify-between gap-3 px-5 py-4 border ${
        highlight ? 'border-amber-200' : 'border-gray-100'
      }`}
    >
      <div className="min-w-0">
        <p
          className={`text-2xl font-bold leading-none ${
            highlight ? 'text-amber-500' : 'text-gray-900'
          }`}
        >
          {value}
        </p>
        <p className="text-xs text-gray-500 mt-1.5 leading-tight truncate">{label}</p>
      </div>
      {Icon && (
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconClass}`}
        >
          <Icon size={19} />
        </div>
      )}
    </div>
  )
}
