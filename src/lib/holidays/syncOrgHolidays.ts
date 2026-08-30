/**
 * Idempotent auto-holiday sync for one organization.
 *
 * Upserts the upcoming Hebrew-calendar holidays (erev chag + chag, Israeli
 * schedule) as organization_holidays rows with source='auto', skipping:
 *  - dates the org dismissed (deleted an auto holiday) — never resurrected
 *  - dates that already have a row (manual rows win via ignoreDuplicates)
 *
 * Callers: org creation (createOrgWithOwner / createOrgForExistingUser /
 * superadmin createOrganization), the holiday-sync Edge Function cron, and
 * scripts/backfill-holidays.ts.
 */

import { DateTime } from 'luxon'
import type { createServiceRoleClient } from '@/lib/supabase/service-role'
import { parseAppLocale, type AppLocale } from '@/lib/i18n/locale'
import { computeUpcomingHolidays } from './hebrewHolidays'

type ServiceRoleClient = ReturnType<typeof createServiceRoleClient>

export type SyncOrgHolidaysOptions = {
  locale?: AppLocale
  /** 'YYYY-MM-DD'; defaults to today in Asia/Jerusalem. */
  from?: string
  horizonMonths?: number
}

export async function syncOrgHolidays(
  db: ServiceRoleClient,
  orgId: string,
  opts: SyncOrgHolidaysOptions = {}
): Promise<{ inserted: number }> {
  let locale = opts.locale
  if (!locale) {
    const { data: org, error } = await db
      .from('organizations')
      .select('default_locale')
      .eq('id', orgId)
      .maybeSingle()
    if (error) throw new Error(`syncOrgHolidays: org lookup failed: ${error.message}`)
    locale = parseAppLocale(org?.default_locale ?? undefined)
  }

  const from = opts.from ?? DateTime.now().setZone('Asia/Jerusalem').toISODate()!
  const candidates = computeUpcomingHolidays(from, locale, opts.horizonMonths)

  const { data: dismissals, error: dismissalsError } = await db
    .from('organization_holiday_dismissals')
    .select('date')
    .eq('organization_id', orgId)
    .gte('date', from)
  if (dismissalsError) {
    throw new Error(`syncOrgHolidays: dismissals lookup failed: ${dismissalsError.message}`)
  }

  const dismissed = new Set((dismissals ?? []).map((d) => d.date))
  const rows = candidates
    .filter((h) => !dismissed.has(h.date))
    .map((h) => ({ organization_id: orgId, date: h.date, name: h.name, source: 'auto' }))

  if (rows.length === 0) return { inserted: 0 }

  const { data: upserted, error: upsertError } = await db
    .from('organization_holidays')
    .upsert(rows, { onConflict: 'organization_id,date', ignoreDuplicates: true })
    .select('id')
  if (upsertError) {
    throw new Error(`syncOrgHolidays: upsert failed: ${upsertError.message}`)
  }

  return { inserted: upserted?.length ?? 0 }
}
