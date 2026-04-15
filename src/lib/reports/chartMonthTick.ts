/**
 * Compact month label for chart axes (from bucket key `yyyy-MM`).
 * Example: "2026-03" → "3/26" (always LTR-friendly for numeric axis).
 */
export function monthKeyToNumericTick(monthKey: string): string {
  const m = monthKey.match(/^(\d{4})-(\d{2})$/)
  if (!m) return monthKey
  const yy = m[1].slice(-2)
  const monthNum = String(parseInt(m[2], 10))
  return `${monthNum}/${yy}`
}

/**
 * Axis tick helper: compact numeric month for `yyyy-MM`, otherwise truncate long text.
 * (Name kept for compatibility with chart tickFormatters / stale bundles.)
 */
export function truncateTick(label: unknown, maxChars = 14): string {
  const s = String(label)
  if (/^\d{4}-\d{2}$/.test(s)) return monthKeyToNumericTick(s)
  if (s.length <= maxChars) return s
  return `${s.slice(0, Math.max(0, maxChars - 1))}…`
}
