/**
 * Short marketing links (/go/<slug>) — storage.
 *
 * Platform-level, service-role only; callers gate on a platform capability.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getShareableBaseUrl } from '@/lib/url/appUrl'
import { LANDING_PATHS, type LandingPath } from './sections'
import { buildShortLinkDestination } from './shortLink'

export type MarketingLink = {
  id: string
  slug: string
  targetPath: string
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  utmContent: string | null
  label: string
  note: string | null
  clickCount: number
  lastClickedAt: string | null
  createdAt: string
  /** getlessio.com/go/<slug> — what gets pasted into the post. */
  shortUrl: string
  /** The same destination spelled out, for places a redirect is not wanted. */
  fullUrl: string
}

type Row = {
  id: string
  slug: string
  target_path: string
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_content: string | null
  utm_term: string | null
  label: string
  note: string | null
  click_count: number
  last_clicked_at: string | null
  created_at: string
}

const COLUMNS =
  'id, slug, target_path, utm_source, utm_medium, utm_campaign, utm_content, utm_term, label, note, click_count, last_clicked_at, created_at'

function toLink(row: Row): MarketingLink {
  // The shareable base, not the request's: the visitor cookies are host-only,
  // so the short link and the landing page must live on the same host (www).
  const base = getShareableBaseUrl()
  return {
    id: row.id,
    slug: row.slug,
    targetPath: row.target_path,
    utmSource: row.utm_source,
    utmMedium: row.utm_medium,
    utmCampaign: row.utm_campaign,
    utmContent: row.utm_content,
    label: row.label,
    note: row.note,
    clickCount: row.click_count,
    lastClickedAt: row.last_clicked_at,
    createdAt: row.created_at,
    shortUrl: `${base}/go/${row.slug}`,
    fullUrl: base + buildShortLinkDestination(row.slug, row, new URLSearchParams()),
  }
}

export async function listMarketingLinks(): Promise<MarketingLink[]> {
  const { data, error } = await createServiceRoleClient()
    .from('marketing_links')
    .select(COLUMNS)
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(500)

  if (error || !data) return []
  return (data as Row[]).map(toLink)
}

/**
 * Latin slug from free text. Hebrew has no sensible transliteration here, so a
 * Hebrew-only label yields '' and the caller falls back to a generated slug.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '')
}

/** Slugs that would shadow something, or read as official. */
const RESERVED = new Set(['api', 'admin', 'go', 'new', 'login', 'signup'])

export type CreateLinkInput = {
  slug: string
  targetPath: LandingPath
  utmSource: string
  utmMedium: string
  utmCampaign: string | null
  utmContent: string | null
  label: string
  note: string | null
  createdBy: string
}

export type CreateLinkResult =
  | { ok: true; id: string; slug: string }
  | { ok: false; error: 'SLUG_TAKEN' | 'SLUG_RESERVED' | 'SAVE_FAILED' }

export async function createMarketingLink(input: CreateLinkInput): Promise<CreateLinkResult> {
  if (RESERVED.has(input.slug)) return { ok: false, error: 'SLUG_RESERVED' }
  if (!LANDING_PATHS.includes(input.targetPath)) return { ok: false, error: 'SAVE_FAILED' }

  const { data, error } = await createServiceRoleClient()
    .from('marketing_links')
    .insert({
      slug: input.slug,
      target_path: input.targetPath,
      utm_source: input.utmSource,
      utm_medium: input.utmMedium,
      utm_campaign: input.utmCampaign,
      utm_content: input.utmContent,
      label: input.label,
      note: input.note,
      created_by: input.createdBy,
    })
    .select('id, slug')
    .single()

  if (error) {
    // 23505 = unique_violation: the slug is taken — possibly by an archived link,
    // which keeps its slug (and keeps redirecting) so an old post never breaks
    // or starts pointing somewhere new.
    return { ok: false, error: error.code === '23505' ? 'SLUG_TAKEN' : 'SAVE_FAILED' }
  }
  return { ok: true, id: data.id as string, slug: data.slug as string }
}

/** Hides the link from the builder. The redirect keeps working: the post is still out there. */
export async function archiveMarketingLink(id: string): Promise<boolean> {
  const { error } = await createServiceRoleClient()
    .from('marketing_links')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id)
  return !error
}
