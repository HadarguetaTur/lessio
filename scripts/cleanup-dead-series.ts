/**
 * One-time cleanup: remove lesson series that are spent.
 *
 * A series is "dead" here when nothing is ahead of it and nothing behind it is
 * worth keeping — no upcoming scheduled lesson, and no occurrence carrying a
 * footprint (completed, no_show, cancelled by hand, charged, or written about).
 * These are what a series-wide cancel left behind before stopping a series knew
 * to mark itself: rows that read as live series with an end date in the past.
 *
 * Deletion goes through deleteLessonSeries, so the same guard the dashboard uses
 * applies here — a series holding any history throws instead of being deleted,
 * and this script reports it rather than working around it.
 *
 * --orphans additionally removes lessons a series-wide cancel wrote that no
 * longer point at any series: lessons.series_id is ON DELETE SET NULL, so an
 * earlier series deletion leaves them behind with nothing to clean them up. They
 * are held to the same footprint test as everything else.
 *
 * Usage:
 *   npx tsx scripts/cleanup-dead-series.ts                    # dry run, every org
 *   npx tsx scripts/cleanup-dead-series.ts --org <uuid>       # dry run, one org
 *   npx tsx scripts/cleanup-dead-series.ts --org <uuid> --orphans --apply
 *
 * Env (falling back to .env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'

function loadEnvLocal(): void {
  const envPath = resolve(process.cwd(), '.env.local')
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim().replace(/^﻿/, '')
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
}

loadEnvLocal()

const apply = process.argv.includes('--apply')
const includeOrphans = process.argv.includes('--orphans')
const orgArgIndex = process.argv.indexOf('--org')
const orgFilter = orgArgIndex === -1 ? null : process.argv[orgArgIndex + 1]

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

async function main() {
  // Imported after the env is loaded — the lib builds its client at call time,
  // but keeping the order explicit avoids depending on that.
  const { hasFootprint, loadSeriesFootprint } = await import('../src/lib/lessons/seriesFootprint')
  const { SERIES_CANCEL_REASON } = await import('../src/lib/lessons/renderCancelReason')
  const { deleteLessonSeries } = await import('../src/lib/lessons/updateSeries')

  let orgQuery = db.from('organizations').select('id, name')
  if (orgFilter) orgQuery = orgQuery.eq('id', orgFilter)
  const { data: orgs, error: orgErr } = await orgQuery
  if (orgErr) throw new Error(orgErr.message)

  const nowIso = new Date().toISOString()
  let totalDead = 0
  let totalLessons = 0
  let totalKept = 0
  let totalOrphans = 0

  for (const org of orgs ?? []) {
    const { data: series, error: sErr } = await db
      .from('lesson_series')
      .select('id, rule, stopped_at')
      .eq('organization_id', org.id)
    if (sErr) throw new Error(sErr.message)
    if (!series?.length) continue

    const { data: upcoming, error: uErr } = await db
      .from('lessons')
      .select('series_id')
      .eq('organization_id', org.id)
      .eq('status', 'scheduled')
      .gte('start_at', nowIso)
      .not('series_id', 'is', null)
    if (uErr) throw new Error(uErr.message)
    const live = new Set((upcoming ?? []).map((l) => l.series_id as string))

    const footprints = await loadSeriesFootprint(db, org.id)

    const dead = series.filter((s) => {
      if (live.has(s.id)) return false
      return (footprints.get(s.id)?.blocking.length ?? 0) === 0
    })
    const keptForHistory = series.filter(
      (s) => !live.has(s.id) && (footprints.get(s.id)?.blocking.length ?? 0) > 0
    )

    if (!dead.length && !keptForHistory.length) continue

    console.log(`\n=== ${org.name} (${org.id}) ===`)
    console.log(`  series: ${series.length}  live: ${series.length - dead.length - keptForHistory.length}`)

    for (const s of dead) {
      const lessons = footprints.get(s.id)?.removable.length ?? 0
      const rule = s.rule as Record<string, unknown>
      totalLessons += lessons
      console.log(
        `  ${apply ? 'DELETE' : 'would delete'}  ${s.id}  ` +
          `day=${rule.day_of_week ?? rule.dayOfWeek ?? '?'} ${rule.start_time ?? rule.startTime ?? '?'} ` +
          `until=${rule.until ?? 'MISSING'}  lessons=${lessons}`
      )
      if (apply) {
        const { deleted } = await deleteLessonSeries(s.id, org.id)
        if (deleted !== lessons) console.log(`      note: deleted ${deleted}, expected ${lessons}`)
      }
    }
    totalDead += dead.length

    for (const s of keptForHistory) {
      const blocking = footprints.get(s.id)?.blocking.length ?? 0
      console.log(`  keep    ${s.id}  has ${blocking} lessons with history — not touched`)
    }
    totalKept += keptForHistory.length

    if (includeOrphans) {
      totalOrphans += await sweepOrphans(org.id, hasFootprint, SERIES_CANCEL_REASON)
    }
  }

  console.log(
    `\n${apply ? 'Deleted' : 'Would delete'} ${totalDead} series and ${totalLessons} lessons; ` +
      `kept ${totalKept} spent series that still hold history.`
  )
  if (includeOrphans) {
    console.log(
      `${apply ? 'Deleted' : 'Would delete'} ${totalOrphans} orphaned series-cancelled lessons.`
    )
  }
  if (!apply) console.log('Dry run — rerun with --apply to make the change.')
}

/**
 * Lessons a series-wide cancel wrote whose series is already gone. Each one is
 * still checked for a charge or a note before it goes — an orphan is not
 * automatically disposable.
 */
async function sweepOrphans(
  orgId: string,
  hasFootprint: (
    lesson: { id: string; status: string; cancel_reason: string | null },
    charged: ReadonlySet<string>,
    noted: ReadonlySet<string>
  ) => boolean,
  seriesReason: string
): Promise<number> {
  const { data: orphans, error } = await db
    .from('lessons')
    .select('id, start_at, status, cancel_reason')
    .eq('organization_id', orgId)
    .eq('cancel_reason', seriesReason)
    .is('series_id', null)
  if (error) throw new Error(error.message)
  if (!orphans?.length) return 0

  const ids = orphans.map((l) => l.id as string)
  const [{ data: charges }, { data: notes }] = await Promise.all([
    db.from('charges').select('lesson_id').in('lesson_id', ids),
    db.from('lesson_notes').select('lesson_id').in('lesson_id', ids),
  ])
  const charged = new Set((charges ?? []).map((c) => c.lesson_id as string))
  const noted = new Set((notes ?? []).map((n) => n.lesson_id as string))

  const removable = orphans.filter(
    (l) =>
      !hasFootprint(
        {
          id: l.id as string,
          status: l.status as string,
          cancel_reason: l.cancel_reason as string | null,
        },
        charged,
        noted
      )
  )
  for (const l of removable) {
    console.log(`  ${apply ? 'DELETE' : 'would delete'}  orphan lesson ${l.id}  ${l.start_at}`)
  }
  for (const l of orphans) {
    if (!removable.includes(l)) {
      console.log(`  keep    orphan lesson ${l.id} — carries a charge or a note`)
    }
  }

  if (apply && removable.length) {
    const { error: delError } = await db
      .from('lessons')
      .delete()
      .eq('organization_id', orgId)
      .in(
        'id',
        removable.map((l) => l.id as string)
      )
    if (delError) throw new Error(`Failed to delete orphaned lessons: ${delError.message}`)
  }
  return removable.length
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
