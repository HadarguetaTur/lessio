import { createServiceRoleClient } from '@/lib/supabase/service-role'

/**
 * Atomically generates the next sequential invoice/credit-note number for an org+year.
 *
 * Uses a read → insert-or-update pattern against `invoice_counters`.
 * The table has a composite PK (organization_id, year, kind) and RLS is deny-all,
 * so only service-role calls reach it.
 *
 * Format:
 *   invoice     → "YYYY-NNNN"    (e.g. "2026-0001")
 *   credit_note → "CR-YYYY-NNNN" (e.g. "CR-2026-0001")
 */
export async function getNextInvoiceNumber(
  orgId: string,
  year: number,
  kind: 'invoice' | 'credit_note'
): Promise<string> {
  const supabase = createServiceRoleClient()

  // Try to read the current counter
  const { data: existing, error: readError } = await supabase
    .from('invoice_counters')
    .select('last_number')
    .eq('organization_id', orgId)
    .eq('year', year)
    .eq('kind', kind)
    .maybeSingle()

  if (readError) {
    throw new Error(
      `[getNextInvoiceNumber] failed to read counter: ${readError.message}`
    )
  }

  let nextNumber: number

  if (existing) {
    // Increment existing counter
    nextNumber = existing.last_number + 1
    const { error: updateError } = await supabase
      .from('invoice_counters')
      .update({ last_number: nextNumber })
      .eq('organization_id', orgId)
      .eq('year', year)
      .eq('kind', kind)

    if (updateError) {
      throw new Error(
        `[getNextInvoiceNumber] failed to update counter: ${updateError.message}`
      )
    }
  } else {
    // First invoice for this org+year+kind — insert with last_number=1
    nextNumber = 1
    const { error: insertError } = await supabase
      .from('invoice_counters')
      .insert({
        organization_id: orgId,
        year,
        kind,
        last_number: nextNumber,
      })

    if (insertError) {
      throw new Error(
        `[getNextInvoiceNumber] failed to insert counter: ${insertError.message}`
      )
    }
  }

  return formatNumber(year, nextNumber, kind)
}

function formatNumber(
  year: number,
  seq: number,
  kind: 'invoice' | 'credit_note'
): string {
  const paddedSeq = String(seq).padStart(4, '0')
  return kind === 'credit_note'
    ? `CR-${year}-${paddedSeq}`
    : `${year}-${paddedSeq}`
}
