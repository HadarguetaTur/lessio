/**
 * Public-business discovery for cold outreach.
 *
 * Google Places supplies the business identity and public website; the site is
 * read only when its robots policy permits it. This module only creates
 * candidates. It deliberately has no path to the sender.
 */

import { DateTime } from 'luxon'

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { findSuppressed } from './suppressions'
import { generateOpener } from './opener'
import { newUnsubscribeToken } from './unsubscribe'

const PLACES_URL = 'https://places.googleapis.com/v1/places:searchText'
const MAX_DAILY_CANDIDATES = 50
const WEBSITE_TIMEOUT_MS = 8_000
const WEBSITE_MAX_BYTES = 250_000

const HEBREW_QUERIES = [
  'מורה פרטי מתמטיקה ישראל',
  'מורה פרטי אנגלית ישראל',
  'מרכז למידה ישראל',
  'מרכז תגבור לימודים ישראל',
]

type Place = {
  id: string
  displayName?: { text?: string }
  formattedAddress?: string
  websiteUri?: string
  nationalPhoneNumber?: string
  primaryTypeDisplayName?: { text?: string }
}

export type DiscoveryCandidate = {
  id: string
  business_name: string
  email: string | null
  phone: string | null
  address: string | null
  website_url: string | null
  source_url: string | null
  category: string | null
  personal_line: string | null
  opener_status: string
  research_status: string
  review_status: string
  rejection_reason: string | null
  created_at: string
}

function placesKey(): string | null {
  return process.env.GOOGLE_PLACES_API_KEY?.trim() || null
}

async function searchPlaces(query: string): Promise<Place[]> {
  const key = placesKey()
  if (!key) throw new Error('GOOGLE_PLACES_API_KEY is not configured')

  const response = await fetch(PLACES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.websiteUri,places.nationalPhoneNumber,places.primaryTypeDisplayName',
    },
    body: JSON.stringify({ textQuery: query, languageCode: 'he', regionCode: 'IL', pageSize: 20 }),
  })
  if (!response.ok) throw new Error(`Google Places returned ${response.status}`)
  const body = (await response.json()) as { places?: Place[] }
  return body.places ?? []
}

function normalizeEmail(value: string): string | null {
  const email = value.trim().toLowerCase().replace(/[),.;:]+$/, '')
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null
}

function emailFromHtml(html: string): string | null {
  const matches = html.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []
  return matches.map(normalizeEmail).find((email): email is string => Boolean(email)) ?? null
}

function originOf(url: string): string | null {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

async function allowsResearch(url: string): Promise<boolean> {
  const origin = originOf(url)
  if (!origin) return false
  try {
    const response = await fetch(`${origin}/robots.txt`, { headers: { 'User-Agent': 'LessioResearch/1.0' } })
    if (response.status === 404) return true
    if (!response.ok) return false
    const robots = await response.text()
    const relevant = robots
      .split(/\r?\n/)
      .map((line) => line.trim().toLowerCase())
    let applies = false
    for (const line of relevant) {
      if (line.startsWith('user-agent:')) applies = line.slice(11).trim() === '*' || line.includes('lessioresearch')
      if (applies && line.startsWith('disallow:') && line.slice(9).trim() === '/') return false
    }
    return true
  } catch {
    return false
  }
}

async function researchWebsite(url: string): Promise<{ email: string | null; excerpt: string | null }> {
  if (!(await allowsResearch(url))) return { email: null, excerpt: null }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), WEBSITE_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'LessioResearch/1.0 (+https://www.getlessio.com)' },
    })
    if (!response.ok) return { email: null, excerpt: null }
    const html = (await response.text()).slice(0, WEBSITE_MAX_BYTES)
    const text = html
      .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    return { email: emailFromHtml(html), excerpt: text.slice(0, 1500) || null }
  } catch {
    return { email: null, excerpt: null }
  } finally {
    clearTimeout(timer)
  }
}

function todayBounds(): { start: string; end: string } {
  const now = DateTime.now().setZone('Asia/Jerusalem')
  return { start: now.startOf('day').toUTC().toISO()!, end: now.plus({ days: 1 }).startOf('day').toUTC().toISO()! }
}

export async function listDiscoveryCandidates(limit = 100): Promise<DiscoveryCandidate[]> {
  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('outbound_candidates')
    .select('id, business_name, email, phone, address, website_url, source_url, category, personal_line, opener_status, research_status, review_status, rejection_reason, created_at')
    .in('review_status', ['ready_for_review', 'new'])
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`[outbound/discovery] list failed: ${error.message}`)
  return (data ?? []) as DiscoveryCandidate[]
}

export async function runDiscovery(input: { limit?: number } = {}): Promise<{ found: number; ready: number; skipped: number }> {
  const db = createServiceRoleClient()
  const { start, end } = todayBounds()
  const { count, error: countError } = await db
    .from('outbound_candidates')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', start)
    .lt('created_at', end)
  if (countError) throw new Error(`[outbound/discovery] daily count failed: ${countError.message}`)
  const requested = Math.min(Math.max(input.limit ?? MAX_DAILY_CANDIDATES, 1), MAX_DAILY_CANDIDATES - (count ?? 0))
  if (requested <= 0) return { found: 0, ready: 0, skipped: 0 }

  const { data: run, error: runError } = await db
    .from('outbound_discovery_runs')
    .insert({ provider: 'google_places', queries: HEBREW_QUERIES, requested_limit: requested })
    .select('id')
    .single()
  if (runError || !run) throw new Error('[outbound/discovery] could not start run')

  try {
    const batches = await Promise.all(HEBREW_QUERIES.map(searchPlaces))
    const places = [...new Map(batches.flat().filter((p) => p.id && p.displayName?.text).map((p) => [p.id, p])).values()].slice(0, requested)
    let ready = 0
    let skipped = 0
    for (const place of places) {
      const website = place.websiteUri ?? null
      const research = website ? await researchWebsite(website) : { email: null, excerpt: null }
      const email = research.email
      const suppressed = email ? await findSuppressed([email]) : new Set<string>()
      const reviewStatus = email && !suppressed.has(email) ? 'ready_for_review' : 'new'
      const { data: candidate, error } = await db
        .from('outbound_candidates')
        .upsert(
          {
            discovery_run_id: run.id,
            provider: 'google_places',
            provider_place_id: place.id,
            business_name: place.displayName?.text ?? 'עסק ללא שם',
            email,
            phone: place.nationalPhoneNumber ?? null,
            address: place.formattedAddress ?? null,
            website_url: website,
            source_url: website,
            category: place.primaryTypeDisplayName?.text ?? null,
            locale: 'he',
            research_status: website ? (research.excerpt ? 'researched' : 'no_contact') : 'no_contact',
            review_status: reviewStatus,
            metadata: { google_places_id: place.id },
          },
          { onConflict: 'provider,provider_place_id' }
        )
        .select('id, business_name, email, source_url, category')
        .single()
      if (error || !candidate) {
        skipped++
        continue
      }
      if (research.excerpt) {
        await db.from('outbound_candidate_evidence').insert({ candidate_id: candidate.id, source_url: website!, kind: 'website', excerpt: research.excerpt })
      }
      if (reviewStatus === 'ready_for_review' && website) {
        const opener = await generateOpener({
          first_name: null,
          company: candidate.business_name,
          subject_area: candidate.category ?? null,
          locale: 'he',
          gender: null,
          source_url: website,
          metadata: {},
        })
        await db.from('outbound_candidates').update(opener.ok ? { personal_line: opener.text, opener_status: 'generated' } : { opener_status: 'failed' }).eq('id', candidate.id)
        ready++
      } else skipped++
    }
    await db.from('outbound_discovery_runs').update({ found_count: places.length, researched_count: places.length, ready_count: ready, finished_at: new Date().toISOString() }).eq('id', run.id)
    return { found: places.length, ready, skipped }
  } catch (error) {
    await db.from('outbound_discovery_runs').update({ error: String(error).slice(0, 1000), finished_at: new Date().toISOString() }).eq('id', run.id)
    throw error
  }
}

/** Explicit human approval is the only bridge from discovery to sendable queue. */
export async function approveDiscoveryCandidates(input: { candidateIds: string[]; actorProfileId: string }): Promise<{ approved: number; skipped: number }> {
  const ids = [...new Set(input.candidateIds)].slice(0, 50)
  if (ids.length === 0) return { approved: 0, skipped: 0 }
  const db = createServiceRoleClient()
  const { data: campaign, error: campaignError } = await db
    .from('outbound_campaigns')
    .select('id')
    .eq('locale', 'he')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (campaignError || !campaign) throw new Error('[outbound/discovery] no active Hebrew campaign')

  const { data, error } = await db
    .from('outbound_candidates')
    .select('id, business_name, email, phone, source_url, category, personal_line, opener_status')
    .in('id', ids)
    .eq('review_status', 'ready_for_review')
  if (error) throw new Error(`[outbound/discovery] candidates load failed: ${error.message}`)

  let approved = 0
  let skipped = ids.length - (data?.length ?? 0)
  for (const candidate of data ?? []) {
    if (!candidate.email || !candidate.personal_line || candidate.opener_status !== 'generated') {
      skipped++
      continue
    }
    const suppressed = await findSuppressed([candidate.email])
    if (suppressed.has(candidate.email)) {
      await db.from('outbound_candidates').update({ review_status: 'rejected', rejection_reason: 'suppressed', reviewed_at: new Date().toISOString(), reviewed_by: input.actorProfileId }).eq('id', candidate.id)
      skipped++
      continue
    }
    const { data: prospect, error: prospectError } = await db
      .from('outbound_prospects')
      .upsert(
        {
          campaign_id: campaign.id,
          email: candidate.email,
          company: candidate.business_name,
          phone: candidate.phone,
          locale: 'he',
          personal_line: candidate.personal_line,
          subject_area: candidate.category,
          source_url: candidate.source_url,
          metadata: { discovery_candidate_id: candidate.id, source: 'google_places' },
          status: 'queued',
          opener_status: 'approved',
          unsubscribe_token: newUnsubscribeToken(),
        },
        { onConflict: 'email', ignoreDuplicates: true }
      )
      .select('id')
      .maybeSingle()
    if (prospectError) throw new Error(`[outbound/discovery] prospect insert failed: ${prospectError.message}`)
    if (!prospect) {
      await db.from('outbound_candidates').update({ review_status: 'duplicate', reviewed_at: new Date().toISOString(), reviewed_by: input.actorProfileId }).eq('id', candidate.id)
      skipped++
      continue
    }
    await db
      .from('outbound_candidates')
      .update({ review_status: 'approved', prospect_id: prospect.id, reviewed_at: new Date().toISOString(), reviewed_by: input.actorProfileId })
      .eq('id', candidate.id)
    approved++
  }
  return { approved, skipped }
}
