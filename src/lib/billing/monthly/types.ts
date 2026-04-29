import type { LessonType } from '@/lib/lessons/types'

// ─── Default per-student prices (spec §6) ──────────────────────────────────

export const PAIR_DEFAULT_PRICE = 112.5
export const GROUP_DEFAULT_PRICE = 120

export const BILLABLE_STATUSES = ['scheduled', 'completed'] as const
export type BillableStatus = (typeof BILLABLE_STATUSES)[number]

// ─── DB row shapes (subset of columns used by the engine) ──────────────────

export interface SubscriptionRow {
  id: string
  organization_id: string
  student_id: string
  subscription_type: string | null
  monthly_amount: number
  start_date: string   // YYYY-MM-DD
  end_date: string | null
  is_paused: boolean
  pause_date: string | null
}

export interface LessonRow {
  id: string
  start_at: string
  end_at: string
  status: string
  lesson_type: LessonType
  price_per_student: number | null
  teacher: { id: string; hourly_rate: number | null }
}

export interface CancellationEventRow {
  id: string
  lesson_id: string
  student_id: string
  cancellation_date: string
  hours_before: number
  is_lt_24h: boolean
  is_charged: boolean
  charge_override: number | null
  billing_month: string
}

export interface MonthlyBillingRow {
  id: string
  organization_id: string
  student_id: string
  parent_id: string | null
  billing_month: string
  is_paid: boolean
  is_approved: boolean
  lessons_amount: number
  subscriptions_amount: number
  cancellations_amount: number
  total_amount: number
  lessons_count: number
  manual_adjustment_amount: number | null
  manual_adjustment_reason: string | null
  manual_adjustment_date: string | null
  // Invoice fields (Sprint 27)
  invoice_number: string | null
  invoice_pdf_url: string | null
  vat_amount: number
  invoice_issued_at: string | null
  // Credit note fields (Sprint 27)
  credit_note_number: string | null
  credit_note_pdf_url: string | null
  credit_note_issued_at: string | null
  credit_note_reason: string | null
  credited_invoice_number: string | null
  created_at: string
  updated_at: string
}

// ─── MissingFieldsError (spec Appendix) ────────────────────────────────────

export interface MissingField {
  table: string
  field: string
  why_needed: string
  example_values: string[]
}

export interface MissingFieldsError {
  MISSING_FIELDS: MissingField[]
}

export function isMissingFieldsError(v: unknown): v is MissingFieldsError {
  return (
    typeof v === 'object' &&
    v !== null &&
    'MISSING_FIELDS' in v &&
    Array.isArray((v as MissingFieldsError).MISSING_FIELDS)
  )
}

// ─── Engine result types ───────────────────────────────────────────────────

export interface LessonsContribution {
  lessonsTotal: number
  lessonsCount: number
}

export interface CancellationsContribution {
  cancellationsTotal: number
  cancellationsCount: number
  pendingCancellationsCount: number
}

export interface SubscriptionsContribution {
  subscriptionsTotal: number
  activeSubscriptionsCount: number
}

export interface BillingResult {
  studentId: string
  billingMonth: string
  lessonsAmount: number
  subscriptionsAmount: number
  cancellationsAmount: number
  totalAmount: number
  lessonsCount: number
  isApproved: boolean
}

export interface BuildMonthResult {
  success: BillingResult[]
  errors: Array<{ studentId: string; error: MissingFieldsError }>
  skipped: string[]
}

// ─── Helpers ───────────────────────────────────────────────────────────────

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}
