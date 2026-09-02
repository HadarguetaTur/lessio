/**
 * Collections summary — the three numbers at the top of /charges.
 *
 * "Open" and "overdue" are computed from open charges net of partial payments;
 * "collected this month" is read from `charge_payments` so a partial payment
 * counts in the month it arrived — the same source as the dashboard revenue
 * KPI, so the two screens never disagree.
 */

import { DateTime } from 'luxon'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { OPEN_CHARGE_STATUSES, getChargeRemaining } from './index'

export interface ChargesSummary {
  /** Still owed across every open charge, net of partial payments. */
  openTotal: number
  /** Open charges with a remaining balance. */
  openCount: number
  /** Distinct parents who still owe something. */
  openDebtorCount: number
  /** The part of `openTotal` whose due date has already passed. */
  overdueTotal: number
  overdueCount: number
  /** Payments received month-to-date, partial payments included. */
  collectedThisMonth: number
}

export interface OpenChargeRow {
  amount: number | string
  amount_paid?: number | string | null
  parent_id: string | null
  /** 'YYYY-MM-DD' or null for legacy rows that were never given terms. */
  due_date: string | null
}

/**
 * Pure aggregation — exported for tests. `todayLocal` is 'YYYY-MM-DD' in the
 * organization's timezone; `due_date` is a calendar date, so plain string
 * comparison is exact. A charge falls due *on* its due date and is overdue
 * only from the day after.
 */
export function summarizeCharges(
  openCharges: OpenChargeRow[],
  payments: Array<{ amount: number | string }>,
  todayLocal: string
): ChargesSummary {
  let openTotal = 0
  let openCount = 0
  let overdueTotal = 0
  let overdueCount = 0
  const debtors = new Set<string>()

  for (const charge of openCharges) {
    const remaining = getChargeRemaining(charge.amount, charge.amount_paid)
    if (remaining <= 0) continue

    openTotal += remaining
    openCount += 1
    if (charge.parent_id) debtors.add(charge.parent_id)

    if (charge.due_date && charge.due_date < todayLocal) {
      overdueTotal += remaining
      overdueCount += 1
    }
  }

  const collectedThisMonth = payments.reduce((sum, p) => sum + Number(p.amount), 0)

  return {
    openTotal: round2(openTotal),
    openCount,
    openDebtorCount: debtors.size,
    overdueTotal: round2(overdueTotal),
    overdueCount,
    collectedThisMonth: round2(collectedThisMonth),
  }
}

export async function getChargesSummary(orgId: string, timezone: string): Promise<ChargesSummary> {
  const db = createServiceRoleClient()

  const now = DateTime.now().setZone(timezone)
  const todayLocal = now.toISODate()!
  const monthStart = now.startOf('month').toUTC().toISO()!
  const nowISO = now.toUTC().toISO()!

  const [chargesRes, paymentsRes] = await Promise.all([
    db
      .from('charges')
      .select('amount, amount_paid, parent_id, due_date')
      .eq('organization_id', orgId)
      .in('status', [...OPEN_CHARGE_STATUSES]),
    db
      .from('charge_payments')
      .select('amount')
      .eq('organization_id', orgId)
      .gte('paid_at', monthStart)
      .lt('paid_at', nowISO),
  ])

  if (chargesRes.error) throw new Error(`[getChargesSummary] ${chargesRes.error.message}`)
  if (paymentsRes.error) throw new Error(`[getChargesSummary] ${paymentsRes.error.message}`)

  return summarizeCharges(
    (chargesRes.data ?? []) as OpenChargeRow[],
    paymentsRes.data ?? [],
    todayLocal
  )
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
