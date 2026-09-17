/** Discovery -> durable research -> shared quality gate -> existing permission-email queue. */
import { DateTime } from 'luxon'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { findSuppressed } from './suppressions'
import { generateCandidateOpener } from './candidateOpener'
import { researchGate, researchWebsite, scoreDiscoveryCandidate, type ResearchFact } from './discoveryResearch'

const PLACES_URL = 'https://places.googleapis.com/v1/places:searchText'
const CITIES = ['תל אביב', 'ירושלים', 'חיפה', 'ראשון לציון', 'פתח תקווה', 'באר שבע', 'נתניה', 'רחובות', 'רמת גן', 'חולון', 'אשדוד', 'כפר סבא', 'הרצליה', 'מודיעין']
type Place = {
  id: string; displayName?: { text?: string }; formattedAddress?: string
  websiteUri?: string; addressComponents?: { types?: string[]; shortText?: string }[]; nationalPhoneNumber?: string; primaryTypeDisplayName?: { text?: string }
}
export type DiscoveryCandidate = {
  id: string; business_name: string; email: string | null; phone: string | null
  address: string | null; website_url: string | null; source_url: string | null
  category: string | null; personal_line: string | null; opener_status: string
  research_status: string; review_status: string; rejection_reason: string | null
  created_at: string; email_source_url: string | null; research_facts: ResearchFact[]
  quality_score: number; quality_reasons: string[]; opener_error: string | null
  research_requested_at: string | null; research_claimed_at: string | null
  research_attempts: number; research_completed_at: string | null
  approval_mode: 'manual' | 'automatic' | null; opener_fact_ids: number[]
}
export type DiscoveryAutomation = { auto_approve: boolean; campaign_id: string | null }

export function discoveryQueries(now = new Date()): string[] {
  const day = DateTime.fromJSDate(now).setZone('Asia/Jerusalem').ordinal
  const city = CITIES[day % CITIES.length]!
  const second = CITIES[(day + 7) % CITIES.length]!
  return ['מרכז למידה צוות מורים ' + city, 'מרכז למידה ' + city, 'מרכז הוראה מתקנת ' + second, 'מרכז תגבור לימודים ' + second]
}

async function searchPlaces(query: string): Promise<Place[]> {
  const key = process.env.GOOGLE_PLACES_API_KEY?.trim()
  if (!key) throw new Error('GOOGLE_PLACES_API_KEY is not configured')
  const response = await fetch(PLACES_URL, {
    method: 'POST', signal: AbortSignal.timeout(12_000),
    headers: {
      'Content-Type': 'application/json', 'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.websiteUri,places.addressComponents,places.nationalPhoneNumber,places.primaryTypeDisplayName',
    },
    body: JSON.stringify({ textQuery: query, languageCode: 'he', regionCode: 'IL', pageSize: 20 }),
  })
  if (!response.ok) throw new Error('Google Places returned ' + response.status)
  return ((await response.json()) as { places?: Place[] }).places ?? []
}

export async function listDiscoveryCandidates(limit = 100): Promise<DiscoveryCandidate[]> {
  const { data, error } = await createServiceRoleClient().rpc('list_eligible_outbound_candidates', { p_limit: limit })
  if (error) throw new Error('[outbound/discovery] list failed: ' + error.message)
  return (data ?? []) as DiscoveryCandidate[]
}

export async function getDiscoveryAutomation(): Promise<DiscoveryAutomation> {
  const { data, error } = await createServiceRoleClient().from('outbound_discovery_settings')
    .select('auto_approve, campaign_id').eq('id', true).single()
  if (error) throw new Error('[outbound/discovery] settings failed: ' + error.message)
  return data as DiscoveryAutomation
}

export async function saveDiscoveryAutomation(input: DiscoveryAutomation & { actorProfileId: string }): Promise<void> {
  const db = createServiceRoleClient()
  if (input.auto_approve) {
    if (!input.campaign_id) throw new Error('CAMPAIGN_REQUIRED')
    const { data, error } = await db.from('outbound_campaigns').select('id, body_text')
      .eq('id', input.campaign_id).eq('is_active', true).eq('locale', 'he').maybeSingle()
    if (error || !data || !data.body_text.includes('{{personal_line}}')) throw new Error('CAMPAIGN_REQUIRES_PERSONAL_LINE')
  }
  const { error } = await db.from('outbound_discovery_settings').update({
    auto_approve: input.auto_approve, campaign_id: input.campaign_id,
    updated_by: input.actorProfileId, updated_at: new Date().toISOString(),
  }).eq('id', true)
  if (error) throw new Error('SETTINGS_SAVE_FAILED')
}

/** Fast collection only. Research has its own retryable cron, never a long HTTP request. */
export async function runDiscovery(): Promise<{ found: number; ready: number; skipped: number; budget_left: number }> {
  const queries = discoveryQueries()
  const batches = await Promise.all(queries.map(searchPlaces))
  const places = [...new Map(batches.flat().filter((p) => p.id && p.displayName?.text && p.addressComponents?.some((part) => part.types?.includes('country') && part.shortText === 'IL')).map((p) => [p.id, p])).values()]
  const { data, error } = await createServiceRoleClient().rpc('reserve_outbound_candidates', {
    p_queries: queries,
    p_places: places.map((place) => ({
      provider_place_id: place.id, business_name: place.displayName!.text,
      phone: place.nationalPhoneNumber ?? null, address: place.formattedAddress ?? null,
      website_url: place.websiteUri ?? null, category: place.primaryTypeDisplayName?.text ?? null,
    })),
  })
  if (error) throw new Error('[outbound/discovery] reservation failed: ' + error.message)
  return data as { found: number; ready: number; skipped: number; budget_left: number }
}

/** Reruns are enqueued, bounded and cannot change a candidate already promoted or rejected. */
export async function requestCandidateResearch(candidateIds: string[]): Promise<number> {
  const { data, error } = await createServiceRoleClient().from('outbound_candidates').update({
    research_requested_at: new Date().toISOString(), research_claimed_at: null,
    research_attempts: 0, review_status: 'new', personal_line: null,
    opener_status: 'pending', opener_error: null, opener_fact_ids: [],
  }).in('id', [...new Set(candidateIds)].slice(0, 50))
    .in('review_status', ['new', 'ready_for_review']).is('prospect_id', null).select('id')
  if (error) throw new Error('[outbound/research] requeue failed: ' + error.message)
  return data?.length ?? 0
}

/** The operator's own verdict. Nothing already in the send queue can be touched here. */
export async function rejectDiscoveryCandidates(candidateIds: string[]): Promise<number> {
  const { data, error } = await createServiceRoleClient().from('outbound_candidates').update({
    review_status: 'rejected', rejection_reason: 'MANUAL', research_requested_at: null,
    research_claimed_at: null, personal_line: null, opener_status: 'skipped', opener_fact_ids: [],
  }).in('id', [...new Set(candidateIds)].slice(0, 50)).is('prospect_id', null)
    .in('review_status', ['new', 'ready_for_review', 'rejected', 'duplicate']).select('id')
  if (error) throw new Error('[outbound/discovery] reject failed: ' + error.message)
  return data?.length ?? 0
}

export async function deleteDiscoveryCandidates(candidateIds: string[]): Promise<number> {
  const { data, error } = await createServiceRoleClient().from('outbound_candidates').delete()
    .in('id', [...new Set(candidateIds)].slice(0, 50)).is('prospect_id', null).select('id')
  if (error) throw new Error('[outbound/discovery] delete failed: ' + error.message)
  return data?.length ?? 0
}

/**
 * A corrected name or email. A manual email is its own source, so a later
 * research rerun keeps it instead of the address scraped from the site.
 */
export async function updateDiscoveryCandidate(input: { id: string; businessName: string; email: string | null }): Promise<'ok' | 'DUPLICATE_EMAIL' | 'NOT_EDITABLE'> {
  const db = createServiceRoleClient()
  const { data: current } = await db.from('outbound_candidates').select('email, email_source_url').eq('id', input.id).is('prospect_id', null).in('review_status', ['new', 'ready_for_review']).maybeSingle()
  if (!current) return 'NOT_EDITABLE'
  const emailChanged = (input.email ?? null) !== (current.email ?? null)
  const { data: updated, error } = await db.from('outbound_candidates').update({
    business_name: input.businessName,
    email: input.email,
    email_source_url: emailChanged ? (input.email ? 'manual' : null) : current.email_source_url,
    rejection_reason: null, review_status: 'new',
    research_requested_at: new Date().toISOString(), research_claimed_at: null, research_attempts: 0,
    personal_line: null, opener_status: 'pending', opener_fact_ids: [],
  }).eq('id', input.id).is('prospect_id', null).in('review_status', ['new', 'ready_for_review']).select('id')
  if (error) return error.code === '23505' ? 'DUPLICATE_EMAIL' : (() => { throw new Error('[outbound/discovery] update failed: ' + error.message) })()
  return updated?.length ? 'ok' : 'NOT_EDITABLE'
}

export async function approveDiscoveryCandidates(input: { candidateIds: string[]; actorProfileId: string }): Promise<{ approved: number; skipped: number }> {
  const db = createServiceRoleClient()
  let approved = 0
  let skipped = 0
  for (const id of [...new Set(input.candidateIds)].slice(0, 50)) {
    const { data, error } = await db.rpc('promote_outbound_candidate', { p_id: id, p_actor: input.actorProfileId, p_automatic: false })
    if (error) throw new Error('[outbound/discovery] promotion failed: ' + error.message)
    if (data === 'approved') approved++
    else skipped++
  }
  return { approved, skipped }
}

async function promoteReadyCandidates(): Promise<number> {
  const db = createServiceRoleClient()
  const settings = await getDiscoveryAutomation()
  if (!settings.auto_approve) return 0
  const { data, error } = await db.from('outbound_candidates').select('id')
    .eq('review_status', 'ready_for_review').is('research_requested_at', null).is('research_claimed_at', null)
    .order('created_at').limit(50)
  if (error) throw new Error('[outbound/research] ready load failed: ' + error.message)
  let approved = 0
  for (const row of data ?? []) {
    const result = await db.rpc('promote_outbound_candidate', { p_id: row.id, p_actor: null, p_automatic: true })
    if (result.error) throw new Error('[outbound/research] promotion failed: ' + result.error.message)
    if (result.data === 'approved') approved++
  }
  return approved
}

const TRANSIENT_ERRORS = new Set(['FETCH_FAILED', 'MODEL_RATE_LIMIT', 'MODEL_UNAVAILABLE', 'MODEL_FAILED'])

export async function runCandidateResearch(): Promise<{ researched: number; ready: number; failed: number; approved: number }> {
  const db = createServiceRoleClient()
  const { data, error } = await db.rpc('claim_outbound_research', { p_limit: 3 })
  if (error) throw new Error('[outbound/research] claim failed: ' + error.message)
  const result = { researched: 0, ready: 0, failed: 0, approved: 0 }
  for (const candidate of (data ?? []) as DiscoveryCandidate[]) {
    try {
      const research = await researchWebsite(candidate.website_url)
      if (candidate.email_source_url === 'manual' && candidate.email) { research.email = candidate.email; research.emailSourceUrl = 'manual' }
      const quality = scoreDiscoveryCandidate({
        businessName: candidate.business_name, category: candidate.category, websiteUrl: candidate.website_url,
        email: research.email, phone: candidate.phone, facts: research.facts,
      })
      let reason = quality.excluded ? 'EXCLUDED_BUSINESS' : research.failure ?? researchGate({
        email: research.email, emailSourceUrl: research.emailSourceUrl,
        facts: research.facts, score: quality.score, excluded: quality.excluded,
      })
      if (research.email && (await findSuppressed([research.email])).has(research.email)) reason = 'SUPPRESSED'
      const opener = reason ? null : await generateCandidateOpener(research.facts)
      const openerError = opener && !opener.ok ? opener.error : null
      const ready = !reason && opener?.ok === true
      const { data: saved, error: saveError } = await db.rpc('complete_outbound_research', {
        p_id: candidate.id, p_claim: candidate.research_claimed_at,
        p_result: {
          email: research.email, email_source_url: research.emailSourceUrl,
          research_facts: research.facts, quality_score: quality.score, quality_reasons: quality.reasons,
          research_status: research.pages.length ? 'researched' : 'failed',
          review_status: ['SUPPRESSED', 'EXCLUDED_BUSINESS', 'TEAM_SIZE_OUT_OF_RANGE'].includes(reason ?? '') ? 'rejected' : ready ? 'ready_for_review' : 'new',
          rejection_reason: reason, personal_line: opener?.ok ? opener.text : null,
          opener_status: opener?.ok ? 'generated' : openerError ? 'failed' : 'skipped',
          opener_error: openerError, opener_fact_ids: opener?.ok ? opener.factIds : [],
          retry: TRANSIENT_ERRORS.has(reason ?? openerError ?? ''),
        },
        p_evidence: research.pages.map((page) => ({ source_url: page.url, kind: page.kind, excerpt: page.text.slice(0, 3000) })),
      })
      if (saveError) throw saveError
      if (saved) { result.researched++; if (ready) result.ready++; else result.failed++ }
    } catch (failure) {
      const duplicate = typeof failure === 'object' && failure !== null && 'code' in failure && failure.code === '23505'
      // Guard the lease: a stale worker must not undo a rerun or promotion.
      const { error: updateError } = await db.from('outbound_candidates').update({
        research_status: 'failed', review_status: duplicate ? 'duplicate' : 'new',
        rejection_reason: duplicate ? 'DUPLICATE_EMAIL' : 'RESEARCH_FAILED',
        opener_error: duplicate ? null : 'RESEARCH_FAILED', personal_line: null,
        opener_status: 'failed', research_claimed_at: null,
        research_requested_at: !duplicate && candidate.research_attempts < 3
          ? DateTime.now().plus({ minutes: 30 }).toISO() : null,
      }).eq('id', candidate.id).eq('research_claimed_at', candidate.research_claimed_at!)
      if (updateError) throw new Error('[outbound/research] failure persistence failed')
      console.error('[outbound/research] candidate failed', { id: candidate.id, duplicate })
      result.failed++
    }
  }
  // Runs even with no new research: enabling automation drains already-qualified candidates.
  result.approved = await promoteReadyCandidates()
  return result
}
