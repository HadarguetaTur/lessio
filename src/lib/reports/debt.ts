/**
 * Debt report data layer.
 * Lists parents with pending charges, sorted by outstanding balance desc.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'

export type DebtRow = {
  parentId: string
  parentName: string
  phone: string
  totalDebt: number
  oldestDueDate: string | null
}

export type DebtReportData = {
  rows: DebtRow[]
  totalDebt: number
}

export async function getDebtReport(orgId: string): Promise<DebtReportData> {
  const db = createServiceRoleClient()

  const { data, error } = await db
    .from('charges')
    .select('parent_id, amount, due_date, parents(id, full_name, phone)')
    .eq('organization_id', orgId)
    .eq('status', 'pending')

  if (error) throw new Error(`Debt report query failed: ${error.message}`)

  const parentMap = new Map<string, DebtRow>()

  for (const charge of data ?? []) {
    const parent = charge.parents as { id: string; full_name: string; phone: string } | null
    if (!parent) continue

    const existing = parentMap.get(parent.id)
    if (existing) {
      existing.totalDebt += Number(charge.amount)
      if (
        charge.due_date &&
        (!existing.oldestDueDate || charge.due_date < existing.oldestDueDate)
      ) {
        existing.oldestDueDate = charge.due_date
      }
    } else {
      parentMap.set(parent.id, {
        parentId: parent.id,
        parentName: parent.full_name,
        phone: parent.phone,
        totalDebt: Number(charge.amount),
        oldestDueDate: charge.due_date ?? null,
      })
    }
  }

  const rows = [...parentMap.values()].sort((a, b) => b.totalDebt - a.totalDebt)
  return { rows, totalDebt: rows.reduce((s, r) => s + r.totalDebt, 0) }
}
