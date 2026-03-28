/**
 * KPI metric card for the dashboard.
 * Server component — no client-side state.
 * Per /docs/sprint-9-scope.md § Story 3.
 */

export function KpiCard({
  label,
  value,
  highlight,
}: {
  label: string
  value: string | number
  highlight?: boolean
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 px-4 py-4 text-center">
      <p className={`text-2xl font-bold ${highlight ? 'text-amber-500' : 'text-gray-900'}`}>
        {value}
      </p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
    </div>
  )
}
