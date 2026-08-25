/**
 * Debtors overview — the per-parent view behind /billing/debts.
 *
 * The debt report (`src/lib/reports/debt.ts`) answers "how much is owed" for an
 * accountant export. This answers "who do I chase, and for what" for the person
 * actually collecting: every open charge, grouped under the parent who owes it,
 * with the children it belongs to and whether the parent can be messaged.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { OPEN_CHARGE_STATUSES, type ChargeStatus, type ChargeType } from './index'

export interface DebtorCharge {
  id: string
  /** What was billed. */
  amount: number
  /** What has come in so far — non-zero means a partial payment. */
  amountPaid: number
  /** What is still owed: `amount - amountPaid`. */
  remaining: number
  chargeType: ChargeType
  status: ChargeStatus
  notes: string | null
  createdAt: string
  /** Days since the charge was raised. Computed server-side so render stays pure. */
  ageDays: number
  hasPaymentLink: boolean
  sentAt: string | null
  hasInvoice: boolean
}

export interface DebtorRow {
  parentId: string
  parentName: string
  phone: string | null
  /** Business-initiated WhatsApp is blocked for this parent. */
  optedOut: boolean
  childrenNames: string[]
  totalDebt: number
  /** Creation date of the oldest open charge — `due_date` is never populated. */
  oldestChargeAt: string
  /** Days since that oldest charge. */
  oldestAgeDays: number
  chargeCount: number
  charges: DebtorCharge[]
}

export interface DebtorsOverview {
  rows: DebtorRow[]
  totalDebt: number
  debtorCount: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RawChargeRow = any

/**
 * Groups open charges by parent. Exported for tests — the query lives in
 * {@link getDebtorsOverview}.
 */
export function groupDebtors(
  charges: RawChargeRow[],
  childrenByParent: Map<string, string[]>,
  /** Reference point for age calculations — injectable so tests stay deterministic. */
  now: number = Date.now()
): DebtorsOverview {
  const byParent = new Map<string, DebtorRow>()

  for (const charge of charges) {
    const parent = charge.parents as
      | { id: string; full_name: string; phone: string | null; opted_out_at: string | null }
      | null
    if (!parent) continue

    const amount = Number(charge.amount)
    const amountPaid = Number(charge.amount_paid ?? 0)
    const remaining = round2(Math.max(0, amount - amountPaid))
    const detail: DebtorCharge = {
      id: charge.id,
      amount,
      amountPaid,
      remaining,
      chargeType: charge.charge_type,
      status: charge.status,
      notes: charge.notes ?? null,
      createdAt: charge.created_at,
      ageDays: ageInDays(charge.created_at, now),
      hasPaymentLink: Boolean(charge.payment_link),
      sentAt: charge.sent_at ?? null,
      hasInvoice: Boolean(charge.student_monthly_billing?.invoice_number),
    }

    const existing = byParent.get(parent.id)
    if (existing) {
      existing.totalDebt = round2(existing.totalDebt + remaining)
      existing.chargeCount += 1
      existing.charges.push(detail)
      if (detail.createdAt < existing.oldestChargeAt) {
        existing.oldestChargeAt = detail.createdAt
        existing.oldestAgeDays = detail.ageDays
      }
      continue
    }

    byParent.set(parent.id, {
      parentId: parent.id,
      parentName: parent.full_name,
      phone: parent.phone ?? null,
      optedOut: Boolean(parent.opted_out_at),
      childrenNames: childrenByParent.get(parent.id) ?? [],
      totalDebt: remaining,
      oldestChargeAt: detail.createdAt,
      oldestAgeDays: detail.ageDays,
      chargeCount: 1,
      charges: [detail],
    })
  }

  const rows = [...byParent.values()].sort((a, b) => b.totalDebt - a.totalDebt)
  // Oldest charge first inside a parent — that is the one to chase.
  for (const row of rows) {
    row.charges.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  return {
    rows,
    totalDebt: round2(rows.reduce((sum, r) => sum + r.totalDebt, 0)),
    debtorCount: rows.length,
  }
}

export async function getDebtorsOverview(orgId: string): Promise<DebtorsOverview> {
  const db = createServiceRoleClient()

  const [chargesRes, relationsRes] = await Promise.all([
    db
      .from('charges')
      .select(
        'id, amount, amount_paid, charge_type, status, notes, created_at, payment_link, sent_at, parent_id, parents(id, full_name, phone, opted_out_at), student_monthly_billing(invoice_number)'
      )
      .eq('organization_id', orgId)
      .in('status', [...OPEN_CHARGE_STATUSES])
      .order('created_at', { ascending: true }),
    db
      .from('relationships')
      .select('parent_id, students(full_name)')
      .eq('organization_id', orgId),
  ])

  if (chargesRes.error) throw new Error(`[getDebtorsOverview] ${chargesRes.error.message}`)
  if (relationsRes.error) throw new Error(`[getDebtorsOverview] ${relationsRes.error.message}`)

  const childrenByParent = new Map<string, string[]>()
  for (const relation of relationsRes.data ?? []) {
    const student = relation.students as unknown as { full_name: string } | null
    if (!student?.full_name) continue
    const parentId = relation.parent_id as string
    const names = childrenByParent.get(parentId)
    if (names) {
      if (!names.includes(student.full_name)) names.push(student.full_name)
    } else {
      childrenByParent.set(parentId, [student.full_name])
    }
  }

  return groupDebtors(chargesRes.data ?? [], childrenByParent)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

const DAY_MS = 24 * 60 * 60 * 1000

function ageInDays(iso: string, now: number): number {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / DAY_MS))
}
