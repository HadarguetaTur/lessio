/**
 * Row-selection maths for the charges table.
 *
 * Client-safe and pure: the components own the state, this owns the rules —
 * what a selection totals, how many parents it spans, and how "select all"
 * behaves. Kept out of the components so it can be tested without a DOM.
 */

/** The minimum a selected row must carry for the bulk dialog to describe it. */
export interface SelectedCharge {
  chargeId: string
  parentId: string
  parentName: string
  /** Whether this parent can be sent a WhatsApp confirmation at all. */
  parentHasPhone: boolean
  /** What is still owed on this charge — what settling it will record. */
  remaining: number
}

export type ChargeSelection = ReadonlyMap<string, SelectedCharge>

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function toggleSelection(
  selection: ChargeSelection,
  charge: SelectedCharge
): Map<string, SelectedCharge> {
  const next = new Map(selection)
  if (next.has(charge.chargeId)) next.delete(charge.chargeId)
  else next.set(charge.chargeId, charge)
  return next
}

/**
 * Adds every row, or clears them if they are all already selected.
 *
 * Only the rows passed in are touched, so a "select all" in one parent's
 * expanded list never disturbs a selection made elsewhere.
 */
export function toggleAllOf(
  selection: ChargeSelection,
  rows: SelectedCharge[]
): Map<string, SelectedCharge> {
  const next = new Map(selection)
  const allSelected = rows.length > 0 && rows.every((r) => next.has(r.chargeId))
  for (const row of rows) {
    if (allSelected) next.delete(row.chargeId)
    else next.set(row.chargeId, row)
  }
  return next
}

/** Drops rows that are no longer on screen — a filter change must not settle what the user cannot see. */
export function retainOnly(
  selection: ChargeSelection,
  visibleIds: Iterable<string>
): Map<string, SelectedCharge> {
  const visible = new Set(visibleIds)
  const next = new Map<string, SelectedCharge>()
  for (const [id, charge] of selection) if (visible.has(id)) next.set(id, charge)
  return next
}

export type SelectAllState = 'none' | 'some' | 'all'

export function selectAllState(selection: ChargeSelection, rows: SelectedCharge[]): SelectAllState {
  if (rows.length === 0) return 'none'
  const selected = rows.filter((r) => selection.has(r.chargeId)).length
  if (selected === 0) return 'none'
  return selected === rows.length ? 'all' : 'some'
}

export interface SelectionSummary {
  count: number
  total: number
  /** One entry per parent, in the order their first charge was selected. */
  parents: Array<{ parentId: string; parentName: string; parentHasPhone: boolean; amount: number }>
  /** True when at least one selected parent can receive a confirmation. */
  anyPhone: boolean
}

export function summarize(selection: ChargeSelection): SelectionSummary {
  const parents = new Map<string, SelectionSummary['parents'][number]>()
  let total = 0

  for (const charge of selection.values()) {
    total = round2(total + charge.remaining)
    const entry = parents.get(charge.parentId) ?? {
      parentId: charge.parentId,
      parentName: charge.parentName,
      parentHasPhone: charge.parentHasPhone,
      amount: 0,
    }
    entry.amount = round2(entry.amount + charge.remaining)
    parents.set(charge.parentId, entry)
  }

  return {
    count: selection.size,
    total,
    parents: [...parents.values()],
    anyPhone: [...parents.values()].some((p) => p.parentHasPhone),
  }
}
