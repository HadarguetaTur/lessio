'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { z } from 'zod'

import { requirePlatformSession } from '@/lib/superadmin/session'
import { recordAdminAction } from '@/lib/superadmin/audit'
import {
  archiveMarketingLink,
  createMarketingLink,
  slugify,
} from '@/lib/landing-analytics/links'
import {
  LANDING_PATHS,
  NOTRACK_COOKIE,
  SLUG_PATTERN,
} from '@/lib/landing-analytics/sections'

/**
 * Short-link management for /admin/attribution.
 */

export type AttributionActionState = {
  error?: string
  ok?: boolean
  /** The slug just created, so the form can point at the new row. */
  slug?: string
}

/** utm values end up in URLs people read; keep them to what reads cleanly. */
const utmValue = z
  .string()
  .trim()
  .toLowerCase()
  .max(60)
  .regex(/^[a-z0-9][a-z0-9_.-]*$/)

const createSchema = z.object({
  targetPath: z.enum(LANDING_PATHS),
  label: z.string().trim().min(2).max(80),
  note: z.string().trim().max(200).optional(),
  slug: z.string().trim().toLowerCase().max(40).optional(),
  utmSource: utmValue,
  utmMedium: utmValue,
  utmCampaign: utmValue.optional(),
})

function optional(value: FormDataEntryValue | null): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

export async function createMarketingLinkAction(
  _prev: AttributionActionState | null,
  formData: FormData
): Promise<AttributionActionState> {
  const session = await requirePlatformSession('growth.write')

  const parsed = createSchema.safeParse({
    targetPath: formData.get('targetPath'),
    label: formData.get('label'),
    note: optional(formData.get('note')),
    slug: optional(formData.get('slug')),
    utmSource: formData.get('utmSource'),
    utmMedium: formData.get('utmMedium'),
    utmCampaign: optional(formData.get('utmCampaign')),
  })
  if (!parsed.success) return { error: 'INVALID_INPUT' }

  // A Hebrew group name slugifies to nothing; a short random slug still beats
  // asking for one, and it can always be typed by hand instead.
  const slug =
    parsed.data.slug ||
    slugify(parsed.data.label) ||
    `p-${crypto.randomUUID().slice(0, 6)}`
  if (!SLUG_PATTERN.test(slug)) return { error: 'INVALID_SLUG' }

  const result = await createMarketingLink({
    slug,
    targetPath: parsed.data.targetPath,
    utmSource: parsed.data.utmSource,
    utmMedium: parsed.data.utmMedium,
    utmCampaign: parsed.data.utmCampaign ?? null,
    // The slug doubles as utm_content, so the consent-gated pixels and the
    // signup attribution can tell posts apart too — not just our own table.
    utmContent: slug,
    label: parsed.data.label,
    note: parsed.data.note ?? null,
    createdBy: session.profileId,
  })
  if (!result.ok) return { error: result.error }

  await recordAdminAction({
    actorProfileId: session.profileId,
    action: 'attribution.link_create',
    targetType: 'marketing_links',
    targetId: result.id,
    metadata: { slug: result.slug, targetPath: parsed.data.targetPath },
  })

  revalidatePath('/admin/attribution')
  return { ok: true, slug: result.slug }
}

const archiveSchema = z.object({ id: z.uuid() })

export async function archiveMarketingLinkAction(
  _prev: AttributionActionState | null,
  formData: FormData
): Promise<AttributionActionState> {
  const session = await requirePlatformSession('growth.write')

  const parsed = archiveSchema.safeParse({ id: formData.get('id') })
  if (!parsed.success) return { error: 'INVALID_INPUT' }

  if (!(await archiveMarketingLink(parsed.data.id))) return { error: 'SAVE_FAILED' }

  await recordAdminAction({
    actorProfileId: session.profileId,
    action: 'attribution.link_archive',
    targetType: 'marketing_links',
    targetId: parsed.data.id,
  })

  revalidatePath('/admin/attribution')
  return { ok: true }
}

/**
 * Stops this browser's own landing visits from being measured.
 *
 * Whoever runs the campaign opens the landing page more than anyone else does,
 * and at a few dozen visits a day that is enough to bend every number. The
 * beacon already ignores a signed-in browser; this covers the phone, and the
 * incognito window used to check a post.
 */
export async function setNoTrackAction(
  _prev: AttributionActionState | null,
  formData: FormData
): Promise<AttributionActionState> {
  await requirePlatformSession('growth.read')

  const store = await cookies()
  if (formData.get('enable') === '1') {
    store.set(NOTRACK_COOKIE, '1', {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
    })
  } else {
    store.delete(NOTRACK_COOKIE)
  }

  revalidatePath('/admin/attribution')
  return { ok: true }
}
