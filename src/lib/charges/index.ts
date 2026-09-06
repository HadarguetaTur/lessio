import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { phoneDigits, searchable } from '@/lib/search/text'
import { logChargeAudit } from './audit'

export type ChargeStatus = 'pending' | 'invoiced' | 'paid' | 'waived' | 'voided'
export type ChargeType = 'lesson' | 'cancellation' | 'manual' | 'monthly'

export const OPEN_CHARGE_STATUSES = ['pending', 'invoiced'] as const

export interface Charge {
  id: string
  amount: number
  /** How much has come in so far. Non-zero on an open charge means a partial payment. */
  amount_paid: number
  charge_type: ChargeType
  status: ChargeStatus
  notes: string | null
  paid_at: string | null
  /** 'YYYY-MM-DD' — when the charge falls due; null on legacy rows. */
  due_date: string | null
  created_at: string
  lesson_id: string | null
  payment_link: string | null
  payment_reference: string | null
  payment_provider: string | null
  receipt_url: string | null
  receipt_issued_at: string | null
  resolved_at: string | null
  resolution_reason: string | null
  parent: { id: string; full_name: string; phone: string | null }
  /**
   * Who the charge is *for*, when it came from a monthly bill. A charge belongs
   * to the paying parent, but /billing lists the same money by student, and
   * reconciling the two surfaces without this meant opening every row
   * (UX audit 8, F-M6). Null for charges not tied to a monthly bill.
   */
  student_name: string | null
  lesson: { start_at: string } | null
}

const CHARGE_SELECT =
  'id, amount, amount_paid, charge_type, status, notes, paid_at, due_date, created_at, lesson_id, payment_link, payment_reference, payment_provider, receipt_url, receipt_issued_at, resolved_at, resolution_reason, parents(id, full_name, phone), lessons(start_at), student_monthly_billing(students(full_name))'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapChargeRow(c: any): Charge {
  return {
    id: c.id,
    amount: Number(c.amount),
    amount_paid: Number(c.amount_paid ?? 0),
    charge_type: c.charge_type,
    status: c.status,
    notes: c.notes,
    paid_at: c.paid_at,
    due_date: c.due_date ?? null,
    created_at: c.created_at,
    lesson_id: c.lesson_id,
    payment_link: c.payment_link ?? null,
    payment_reference: c.payment_reference ?? null,
    payment_provider: c.payment_provider ?? null,
    receipt_url: c.receipt_url ?? null,
    receipt_issued_at: c.receipt_issued_at ?? null,
    resolved_at: c.resolved_at ?? null,
    resolution_reason: c.resolution_reason ?? null,
    student_name: c.student_monthly_billing?.students?.full_name ?? null,
    parent: {
      id: c.parents?.id,
      full_name: c.parents?.full_name,
      phone: c.parents?.phone ?? null,
    },
    lesson: c.lessons as { start_at: string } | null,
  }
}

export interface ChargesFilter {
  status?: ChargeStatus
  parentId?: string
  /** Parent ids whose parent/student contact details matched the free-text search. */
  parentIds?: string[]
  dateFrom?: string
  dateToExclusive?: string
  /**
   * 'YYYY-MM-DD' (today, in the org timezone). Narrows to open charges whose
   * due date is strictly before it — i.e. what is overdue right now.
   */
  overdueBefore?: string
}

export async function getCharges(
  organizationId: string,
  filter: ChargesFilter = {}
): Promise<Charge[]> {
  const supabase = await createClient()

  let query = supabase
    .from('charges')
    .select(CHARGE_SELECT)
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })

  if (filter.status) query = query.eq('status', filter.status)
  if (filter.parentId) query = query.eq('parent_id', filter.parentId)
  if (filter.parentIds) {
    if (filter.parentIds.length === 0) return []
    query = query.in('parent_id', filter.parentIds)
  }
  if (filter.dateFrom) query = query.gte('created_at', filter.dateFrom)
  if (filter.dateToExclusive) query = query.lt('created_at', filter.dateToExclusive)
  if (filter.overdueBefore) {
    query = query.in('status', [...OPEN_CHARGE_STATUSES]).lt('due_date', filter.overdueBefore)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)

  return (data ?? []).map(mapChargeRow)
}

/**
 * Resolves a billing search to the parents whose charges should be shown.
 * A charge belongs to a parent, while a student is connected through
 * relationships, so both sides are searched before filtering the ledger.
 */
export async function findChargeParentIds(
  organizationId: string,
  search: string
): Promise<string[]> {
  const term = searchable(search)
  if (!term) return []

  const db = createServiceRoleClient()
  const [
    { data: parents, error: parentsError },
    { data: relationships, error: relationshipsError },
  ] = await Promise.all([
    db
      .from('parents')
      .select('id, full_name, phone, second_phone')
      .eq('organization_id', organizationId),
    db
      .from('relationships')
      .select('parent_id, students(full_name)')
      .eq('organization_id', organizationId),
  ])

  if (parentsError) throw new Error(parentsError.message)
  if (relationshipsError) throw new Error(relationshipsError.message)

  const termDigits = phoneDigits(search)
  const matches = new Set<string>()

  for (const parent of parents ?? []) {
    const nameMatches = searchable(parent.full_name).includes(term)
    const phoneMatches = Boolean(
      termDigits &&
      [parent.phone, parent.second_phone].some((phone) => phoneDigits(phone).includes(termDigits))
    )
    if (nameMatches || phoneMatches) matches.add(parent.id)
  }

  for (const relationship of relationships ?? []) {
    const student = relationship.students as { full_name?: string } | null
    if (student && searchable(student.full_name).includes(term)) {
      matches.add(relationship.parent_id)
    }
  }

  return [...matches]
}

export async function getParentDebt(parentId: string, organizationId: string): Promise<number> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('charges')
    .select('amount, amount_paid')
    .eq('parent_id', parentId)
    .eq('organization_id', organizationId)
    .in('status', [...OPEN_CHARGE_STATUSES])

  if (error) throw new Error(error.message)
  return sumRemaining(data ?? [])
}

export interface ParentOpenBalance {
  /** What is still owed across every open charge. */
  total: number
  /** How many open charges make up that total. */
  count: number
}

/**
 * Open balance per parent, for the parents shown on a filtered ledger page.
 *
 * The rows on screen cannot be summed for this: a status or date filter hides
 * the rest of a parent's debt, and "settle the whole balance" must mean the
 * whole balance. One query for every parent on the page, not one per row.
 */
export async function getOpenBalancesByParent(
  organizationId: string,
  parentIds: string[]
): Promise<Map<string, ParentOpenBalance>> {
  const balances = new Map<string, ParentOpenBalance>()
  if (parentIds.length === 0) return balances

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('charges')
    .select('parent_id, amount, amount_paid')
    .eq('organization_id', organizationId)
    .in('parent_id', parentIds)
    .in('status', [...OPEN_CHARGE_STATUSES])

  if (error) throw new Error(error.message)

  for (const row of data ?? []) {
    const remaining = getChargeRemaining(row.amount, row.amount_paid)
    if (remaining <= 0) continue
    const current = balances.get(row.parent_id) ?? { total: 0, count: 0 }
    balances.set(row.parent_id, {
      total: Math.round((current.total + remaining) * 100) / 100,
      count: current.count + 1,
    })
  }

  return balances
}

/**
 * Open debt for a set of charge rows: what is owed, not what was billed.
 * Use this anywhere charges are summed, so a partially-paid charge counts only
 * for its remainder.
 */
export function getChargeRemaining(
  amount: number | string,
  amountPaid: number | string | null | undefined
): number {
  return Math.max(0, Number(amount) - Number(amountPaid ?? 0))
}

export function sumRemaining(
  rows: Array<{
    amount: number | string
    amount_paid?: number | string | null
  }>
): number {
  const total = rows.reduce(
    (sum, row) => sum + getChargeRemaining(row.amount, row.amount_paid ?? 0),
    0
  )
  return Math.round(total * 100) / 100
}

export async function getChargeById(
  organizationId: string,
  chargeId: string
): Promise<Charge | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('charges')
    .select(CHARGE_SELECT)
    .eq('organization_id', organizationId)
    .eq('id', chargeId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) return null

  return mapChargeRow(data)
}

/**
 * Thrown when a waived or voided charge is asked to become paid. Those statuses
 * are terminal: the charge was deliberately taken out of the ledger, so paying
 * it would silently resurrect debt someone already settled.
 */
export class ChargeAlreadyResolvedError extends Error {
  constructor(public readonly status: ChargeStatus) {
    super(`Charge is ${status} and cannot be marked paid`)
    this.name = 'ChargeAlreadyResolvedError'
  }
}

export async function markChargeAsPaid(
  chargeId: string,
  organizationId: string,
  notes?: string | null,
  actorProfileId?: string | null,
  paidAtHint?: string
): Promise<void> {
  const supabase = createServiceRoleClient()
  const paidAt = paidAtHint ?? new Date().toISOString()

  const { data: existing, error: loadError } = await supabase
    .from('charges')
    .select('status, amount, amount_paid, parent_id')
    .eq('id', chargeId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (loadError) throw new Error(loadError.message)
  if (existing && (existing.status === 'waived' || existing.status === 'voided')) {
    throw new ChargeAlreadyResolvedError(existing.status as ChargeStatus)
  }

  const payload: Record<string, unknown> = {
    status: 'paid',
    paid_at: paidAt,
    updated_at: paidAt,
  }
  if (notes !== undefined) {
    payload.notes = notes || null
  }

  // Paid means fully covered: keep the denormalised total in step so debt sums
  // (amount - amount_paid) agree with the status.
  const outstanding = existing
    ? Math.max(0, Number(existing.amount) - Number(existing.amount_paid ?? 0))
    : 0
  if (existing) {
    payload.amount_paid = Number(existing.amount)
  }

  const { data: updatedCharge, error } = await supabase
    .from('charges')
    .update(payload)
    .eq('id', chargeId)
    .eq('organization_id', organizationId)
    .select('charge_type, billing_record_id')
    .single()

  if (error) throw new Error(error.message)

  // Settling the balance in one go is itself a payment. Recording it keeps
  // charge_payments a complete history — and revenue reporting reads from it.
  // When the caller already wrote the payment row (recordChargePayment updates
  // amount_paid first), outstanding is 0 and nothing is duplicated here.
  if (outstanding > 0) {
    const { error: paymentError } = await supabase.from('charge_payments').insert({
      organization_id: organizationId,
      charge_id: chargeId,
      parent_id: (existing?.parent_id as string | null) ?? null,
      amount: outstanding,
      method: 'manual',
      paid_at: paidAt,
      recorded_by_profile_id: actorProfileId ?? null,
      notes: notes?.trim() || null,
    })

    if (paymentError) {
      console.error('[markChargeAsPaid] payment row insert failed', {
        chargeId,
        organizationId,
        error: paymentError.message,
      })
    }
  }

  await logChargeAudit({
    organizationId,
    chargeId,
    parentId: (existing?.parent_id as string | null) ?? null,
    eventType: 'marked_paid',
    actorProfileId: actorProfileId ?? null,
    beforeStatus: (existing?.status as string | null) ?? null,
    afterStatus: 'paid',
    beforeAmount: existing?.amount == null ? null : Number(existing.amount),
    afterAmount: existing?.amount == null ? null : Number(existing.amount),
    reason: notes?.trim() || null,
  })

  if (
    updatedCharge?.charge_type === 'monthly' &&
    typeof updatedCharge.billing_record_id === 'string'
  ) {
    const { error: billingError } = await supabase
      .from('student_monthly_billing')
      .update({
        is_paid: true,
        updated_at: paidAt,
      })
      .eq('id', updatedCharge.billing_record_id)
      .eq('organization_id', organizationId)

    if (billingError) {
      throw new Error(billingError.message)
    }
  }
}
