/**
 * CSV -> outbound_prospects.
 *
 * Every row lands in exactly one bucket: inserted (queued), suppressed
 * (inserted so the operator sees why it will never be mailed), duplicate (an
 * address already known — one prospect per email, globally), or invalid.
 */

import { randomUUID } from 'crypto'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { parseFile } from '@/lib/import/parseFile'
import { normalizeProspectRows, type NormalizeResult } from './normalizeProspects'
import { findSuppressed } from './suppressions'
import { newUnsubscribeToken } from './unsubscribe'

export interface ImportProspectsResult {
  batchId: string
  inserted: number
  suppressed: number
  duplicates: number
  invalid: NormalizeResult['invalid']
  mappedHeaders: Record<string, string>
}

const CHUNK = 500

export async function importProspects(input: {
  campaignId: string
  file: ArrayBuffer
  filename: string
  /** Draft an opening line with the AI for rows that carry a source. */
  generateOpeners?: boolean
}): Promise<ImportProspectsResult> {
  const { headers, rows } = parseFile(input.file, input.filename)
  const normalized = normalizeProspectRows(headers, rows)
  const batchId = randomUUID()

  if (normalized.valid.length === 0) {
    return { batchId, inserted: 0, suppressed: 0, duplicates: 0, invalid: normalized.invalid, mappedHeaders: normalized.mappedHeaders }
  }

  const db = createServiceRoleClient()
  const suppressedSet = await findSuppressed(normalized.valid.map((p) => p.email))

  let inserted = 0
  let suppressed = 0
  let duplicates = 0

  for (let i = 0; i < normalized.valid.length; i += CHUNK) {
    const chunk = normalized.valid.slice(i, i + CHUNK)
    const payload = chunk.map((p) => ({
      campaign_id: input.campaignId,
      email: p.email,
      first_name: p.first_name,
      last_name: p.last_name,
      company: p.company,
      phone: p.phone,
      locale: p.locale,
      gender: p.gender,
      personal_line: p.personal_line,
      unsubscribe_token: newUnsubscribeToken(),
      // A row the AI will draft for is parked until a person approves it; the
      // send claim skips every opener_status other than none/approved.
      opener_status:
        input.generateOpeners && p.source_url && !p.personal_line ? 'pending' : 'none',
      subject_area: p.subject_area,
      source_url: p.source_url,
      metadata: p.metadata,
      status: suppressedSet.has(p.email) ? 'suppressed' : 'queued',
      import_batch_id: batchId,
    }))

    // ignoreDuplicates: an address already in the table (any campaign, any
    // status) is left exactly as it is and reported as a duplicate.
    const { data, error } = await db
      .from('outbound_prospects')
      .upsert(payload, { onConflict: 'email', ignoreDuplicates: true })
      .select('email, status')
    if (error) throw new Error(`[outbound/import] insert failed: ${error.message}`)

    const written = data ?? []
    for (const row of written) {
      if (row.status === 'suppressed') suppressed++
      else inserted++
    }
    duplicates += chunk.length - written.length
  }

  return { batchId, inserted, suppressed, duplicates, invalid: normalized.invalid, mappedHeaders: normalized.mappedHeaders }
}
