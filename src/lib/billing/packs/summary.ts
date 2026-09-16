/**
 * The money-free view of a punch card, for roles that may see a balance but
 * not what was paid: a teacher and an office manager (plan amendment §4).
 * Pure.
 */

import type { PackStatus } from './status'

export interface PackSummary {
  id: string
  name: string
  status: PackStatus
  remaining: number
  total_credits: number
  valid_until: string | null
  isFamily: boolean
}

export function toPackSummary(pack: {
  id: string
  name: string
  status: PackStatus
  remaining: number
  total_credits: number
  valid_until: string | null
  student_id: string | null
}): PackSummary {
  return {
    id: pack.id,
    name: pack.name,
    // Payment state is money: an unpaid card simply is not usable yet.
    status: pack.status === 'pending_payment' ? 'cancelled' : pack.status,
    remaining: pack.remaining,
    total_credits: pack.total_credits,
    valid_until: pack.valid_until,
    isFamily: pack.student_id === null,
  }
}
