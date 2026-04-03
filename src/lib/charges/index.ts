import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export type ChargeStatus = 'pending' | 'invoiced' | 'paid'
export type ChargeType = 'lesson' | 'cancellation' | 'manual'

export interface Charge {
  id: string
  amount: number
  charge_type: ChargeType
  status: ChargeStatus
  notes: string | null
  paid_at: string | null
  created_at: string
  lesson_id: string | null
  payment_link: string | null
  payment_reference: string | null
  payment_provider: string | null
  receipt_url: string | null
  receipt_issued_at: string | null
  parent: { id: string; full_name: string }
  lesson: { start_at: string } | null
}

export interface ChargesFilter {
  status?: ChargeStatus
  parentId?: string
  dateFrom?: string
  dateTo?: string
}

export async function getCharges(
  organizationId: string,
  filter: ChargesFilter = {}
): Promise<Charge[]> {
  const supabase = await createClient()

  let query = supabase
    .from('charges')
    .select(
      'id, amount, charge_type, status, notes, paid_at, created_at, lesson_id, payment_link, payment_reference, payment_provider, receipt_url, receipt_issued_at, parents(id, full_name), lessons(start_at)'
    )
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })

  if (filter.status) query = query.eq('status', filter.status)
  if (filter.parentId) query = query.eq('parent_id', filter.parentId)
  if (filter.dateFrom) query = query.gte('created_at', filter.dateFrom)
  if (filter.dateTo) query = query.lte('created_at', filter.dateTo)

  const { data, error } = await query
  if (error) throw new Error(error.message)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((c: any) => ({
    id: c.id,
    amount: c.amount,
    charge_type: c.charge_type,
    status: c.status,
    notes: c.notes,
    paid_at: c.paid_at,
    created_at: c.created_at,
    lesson_id: c.lesson_id,
    payment_link: c.payment_link ?? null,
    payment_reference: c.payment_reference ?? null,
    payment_provider: c.payment_provider ?? null,
    receipt_url: c.receipt_url ?? null,
    receipt_issued_at: c.receipt_issued_at ?? null,
    parent: c.parents as { id: string; full_name: string },
    lesson: c.lessons as { start_at: string } | null,
  }))
}

export async function getParentDebt(
  parentId: string,
  organizationId: string
): Promise<number> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('charges')
    .select('amount')
    .eq('parent_id', parentId)
    .eq('organization_id', organizationId)
    .in('status', ['pending', 'invoiced'])

  if (error) throw new Error(error.message)
  return (data ?? []).reduce((sum, c) => sum + Number(c.amount), 0)
}

export async function getChargeById(
  organizationId: string,
  chargeId: string
): Promise<Charge | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('charges')
    .select(
      'id, amount, charge_type, status, notes, paid_at, created_at, lesson_id, payment_link, payment_reference, payment_provider, receipt_url, receipt_issued_at, parents(id, full_name), lessons(start_at)'
    )
    .eq('organization_id', organizationId)
    .eq('id', chargeId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) return null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = data as any
  return {
    id: c.id,
    amount: c.amount,
    charge_type: c.charge_type,
    status: c.status,
    notes: c.notes,
    paid_at: c.paid_at,
    created_at: c.created_at,
    lesson_id: c.lesson_id,
    payment_link: c.payment_link ?? null,
    payment_reference: c.payment_reference ?? null,
    payment_provider: c.payment_provider ?? null,
    receipt_url: c.receipt_url ?? null,
    receipt_issued_at: c.receipt_issued_at ?? null,
    parent: c.parents as { id: string; full_name: string },
    lesson: c.lessons as { start_at: string } | null,
  }
}

export async function markChargeAsPaid(
  chargeId: string,
  organizationId: string,
  notes?: string | null
): Promise<void> {
  const supabase = createServiceRoleClient()

  const payload: Record<string, unknown> = {
    status: 'paid',
    paid_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  if (notes !== undefined) {
    payload.notes = notes || null
  }

  const { error } = await supabase
    .from('charges')
    .update(payload)
    .eq('id', chargeId)
    .eq('organization_id', organizationId)

  if (error) throw new Error(error.message)
}
