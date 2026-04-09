import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export interface Subscription {
  id: string
  organization_id: string
  student_id: string
  subscription_type: string | null
  monthly_amount: number
  start_date: string
  end_date: string | null
  is_paused: boolean
  pause_date: string | null
  created_at: string
  updated_at: string
  student: { id: string; full_name: string } | null
}

const SUB_SELECT =
  'id, organization_id, student_id, subscription_type, monthly_amount, start_date, end_date, is_paused, pause_date, created_at, updated_at, students(id, full_name)'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSubscription(row: any): Subscription {
  return {
    id: row.id,
    organization_id: row.organization_id,
    student_id: row.student_id,
    subscription_type: row.subscription_type ?? null,
    monthly_amount: Number(row.monthly_amount),
    start_date: row.start_date,
    end_date: row.end_date ?? null,
    is_paused: row.is_paused,
    pause_date: row.pause_date ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    student: row.students as { id: string; full_name: string } | null,
  }
}

export async function getSubscriptions(
  organizationId: string,
  studentId?: string
): Promise<Subscription[]> {
  const supabase = await createClient()

  let query = supabase
    .from('subscriptions')
    .select(SUB_SELECT)
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })

  if (studentId) {
    query = query.eq('student_id', studentId)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []).map(mapSubscription)
}

export async function getSubscriptionById(
  organizationId: string,
  id: string
): Promise<Subscription | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('subscriptions')
    .select(SUB_SELECT)
    .eq('organization_id', organizationId)
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data ? mapSubscription(data) : null
}

export interface CreateSubscriptionInput {
  organization_id: string
  student_id: string
  subscription_type?: string | null
  monthly_amount: number
  start_date: string
  end_date?: string | null
  is_paused?: boolean
}

export async function createSubscription(
  input: CreateSubscriptionInput
): Promise<Subscription> {
  const supabase = createServiceRoleClient()

  const { data, error } = await supabase
    .from('subscriptions')
    .insert({
      organization_id: input.organization_id,
      student_id: input.student_id,
      subscription_type: input.subscription_type ?? null,
      monthly_amount: input.monthly_amount,
      start_date: input.start_date,
      end_date: input.end_date ?? null,
      is_paused: input.is_paused ?? false,
    })
    .select(SUB_SELECT)
    .single()

  if (error) throw new Error(error.message)
  return mapSubscription(data)
}

export interface UpdateSubscriptionInput {
  subscription_type?: string | null
  monthly_amount?: number
  start_date?: string
  end_date?: string | null
  is_paused?: boolean
  pause_date?: string | null
}

export async function updateSubscription(
  id: string,
  organizationId: string,
  input: UpdateSubscriptionInput
): Promise<Subscription> {
  const supabase = createServiceRoleClient()

  const payload: Record<string, unknown> = {}
  if (input.subscription_type !== undefined) payload.subscription_type = input.subscription_type
  if (input.monthly_amount !== undefined) payload.monthly_amount = input.monthly_amount
  if (input.start_date !== undefined) payload.start_date = input.start_date
  if (input.end_date !== undefined) payload.end_date = input.end_date
  if (input.is_paused !== undefined) {
    payload.is_paused = input.is_paused
    if (input.is_paused) {
      payload.pause_date = new Date().toISOString().slice(0, 10)
    } else {
      payload.pause_date = null
    }
  }
  if (input.pause_date !== undefined) payload.pause_date = input.pause_date

  const { data, error } = await supabase
    .from('subscriptions')
    .update(payload)
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select(SUB_SELECT)
    .single()

  if (error) throw new Error(error.message)
  return mapSubscription(data)
}

export async function deleteSubscription(
  id: string,
  organizationId: string
): Promise<void> {
  const supabase = createServiceRoleClient()

  const { error } = await supabase
    .from('subscriptions')
    .delete()
    .eq('id', id)
    .eq('organization_id', organizationId)

  if (error) throw new Error(error.message)
}
