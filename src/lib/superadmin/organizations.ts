/**
 * Organization list + detail queries for superadmin pages.
 * Server-only — uses service role client.
 *
 * Per /docs/sprint-18-scope.md § Story 3.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { DateTime } from 'luxon'

/** Derived operational status — not persisted in DB. */
export type OrgStatus = 'needs_setup' | 'active' | 'inactive'

export type OrgListItem = {
  id: string
  name: string
  slug: string
  timezone: string
  status: OrgStatus
  lastActivity: string | null
  whatsAppConnected: boolean
  paymentConnected: boolean
  receiptConnected: boolean
  createdAt: string
}

export type OrgDetail = {
  id: string
  name: string
  slug: string
  timezone: string
  breakDurationMinutes: number
  minBookingNoticeHours: number
  billingMode: string
  whatsAppConnected: boolean
  paymentConnected: boolean
  receiptConnected: boolean
  createdAt: string
  lastActivity: string | null
  activeTeachers: number
  activeStudents: number
  pendingCharges: number
}

function deriveStatus(org: {
  whatsapp_phone_number_id: string | null
  lastActivity: string | null
}): OrgStatus {
  if (!org.whatsapp_phone_number_id) return 'needs_setup'
  if (!org.lastActivity) return 'inactive'
  const thirtyDaysAgo = DateTime.utc().minus({ days: 30 }).toISO()!
  return org.lastActivity >= thirtyDaysAgo ? 'active' : 'inactive'
}

async function buildLastActivityMap(db: ReturnType<typeof createServiceRoleClient>): Promise<Map<string, string>> {
  const [lessonsRes, chargesRes, leadsRes] = await Promise.all([
    db.from('lessons').select('organization_id, updated_at'),
    db.from('charges').select('organization_id, updated_at'),
    db.from('leads').select('organization_id, updated_at'),
  ])

  const map = new Map<string, string>()
  for (const row of [
    ...(lessonsRes.data ?? []),
    ...(chargesRes.data ?? []),
    ...(leadsRes.data ?? []),
  ]) {
    const existing = map.get(row.organization_id)
    if (!existing || row.updated_at > existing) {
      map.set(row.organization_id, row.updated_at)
    }
  }
  return map
}

export async function getOrganizationsList(filters?: {
  search?: string
  status?: OrgStatus | ''
  missingSetup?: boolean
}): Promise<OrgListItem[]> {
  const db = createServiceRoleClient()

  const { data: orgs } = await db
    .from('organizations')
    .select('id, name, slug, timezone, created_at, whatsapp_phone_number_id, payment_provider, receipt_config_encrypted')
    .order('created_at', { ascending: false })

  if (!orgs) return []

  const lastActivityMap = await buildLastActivityMap(db)

  let results: OrgListItem[] = orgs.map((o) => {
    const lastActivity = lastActivityMap.get(o.id) ?? null
    return {
      id: o.id,
      name: o.name,
      slug: o.slug,
      timezone: o.timezone,
      status: deriveStatus({ whatsapp_phone_number_id: o.whatsapp_phone_number_id, lastActivity }),
      lastActivity,
      whatsAppConnected: !!o.whatsapp_phone_number_id,
      paymentConnected: !!o.payment_provider,
      receiptConnected: !!o.receipt_config_encrypted,
      createdAt: o.created_at,
    }
  })

  if (filters?.search) {
    const q = filters.search.toLowerCase()
    results = results.filter(
      (o) => o.name.toLowerCase().includes(q) || o.slug.toLowerCase().includes(q)
    )
  }
  if (filters?.status) {
    results = results.filter((o) => o.status === filters.status)
  }
  if (filters?.missingSetup) {
    results = results.filter((o) => !o.whatsAppConnected || !o.paymentConnected)
  }

  return results
}

export async function getOrganizationDetail(id: string): Promise<OrgDetail | null> {
  const db = createServiceRoleClient()

  const [orgRes, teachersRes, studentsRes, chargesRes] = await Promise.all([
    db
      .from('organizations')
      .select('id, name, slug, timezone, break_duration_minutes, min_booking_notice_hours, billing_mode, created_at, whatsapp_phone_number_id, payment_provider, receipt_config_encrypted')
      .eq('id', id)
      .single(),
    db
      .from('teachers')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', id)
      .eq('is_active', true),
    db
      .from('students')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', id)
      .eq('is_active', true),
    db
      .from('charges')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', id)
      .eq('status', 'pending'),
  ])

  if (!orgRes.data) return null

  const o = orgRes.data
  const lastActivityMap = await buildLastActivityMap(db)
  const lastActivity = lastActivityMap.get(id) ?? null

  return {
    id: o.id,
    name: o.name,
    slug: o.slug,
    timezone: o.timezone,
    breakDurationMinutes: o.break_duration_minutes,
    minBookingNoticeHours: o.min_booking_notice_hours,
    billingMode: o.billing_mode ?? 'monthly',
    whatsAppConnected: !!o.whatsapp_phone_number_id,
    paymentConnected: !!o.payment_provider,
    receiptConnected: !!o.receipt_config_encrypted,
    createdAt: o.created_at,
    lastActivity,
    activeTeachers: teachersRes.count ?? 0,
    activeStudents: studentsRes.count ?? 0,
    pendingCharges: chargesRes.count ?? 0,
  }
}
