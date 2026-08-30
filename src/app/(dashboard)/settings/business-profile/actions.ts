'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getSession, requireMutation } from '@/lib/auth/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

// ─── Save Business Profile ──────────────────────────────────────────────────

const BusinessProfileSchema = z.object({
  business_legal_name: z.string().max(200).optional().default(''),
  tax_id: z.string().max(50).optional().default(''),
  business_address: z.string().max(500).optional().default(''),
  currency: z.enum(['ILS', 'USD', 'EUR', 'GBP']),
  default_vat_rate: z
    .number()
    .min(0)
    .max(25),
  enforce_weekly_quota: z.boolean(),
})

export async function saveBusinessProfileAction(
  formData: FormData
): Promise<{ error: string | null }> {
  const session = await getSession()

  if (session.role !== 'owner') {
    return { error: 'Unauthorized — owner only' }
  }

  try {
    requireMutation(session)
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Support mode — read only' }
  }

  const raw = {
    business_legal_name: (formData.get('business_legal_name') as string) || '',
    tax_id: (formData.get('tax_id') as string) || '',
    business_address: (formData.get('business_address') as string) || '',
    currency: formData.get('currency') as string,
    default_vat_rate: parseFloat(formData.get('default_vat_rate') as string),
    // An unchecked switch submits nothing at all, which is the "off" case.
    enforce_weekly_quota: formData.get('enforce_weekly_quota') === 'on',
  }

  const parsed = BusinessProfileSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: 'Invalid input' }
  }

  const db = createServiceRoleClient()
  const { error: updateErr } = await db
    .from('organizations')
    .update({
      business_legal_name: parsed.data.business_legal_name || null,
      tax_id: parsed.data.tax_id || null,
      business_address: parsed.data.business_address || null,
      currency: parsed.data.currency,
      default_vat_rate: parsed.data.default_vat_rate,
      enforce_weekly_quota: parsed.data.enforce_weekly_quota,
    })
    .eq('id', session.orgId)

  if (updateErr) {
    console.error('[settings/business-profile] DB update failed', {
      orgId: session.orgId,
      error: updateErr.message,
    })
    return { error: 'Failed to save' }
  }

  revalidatePath('/settings/business-profile')
  revalidatePath('/billing')
  // The quota switch decides whether the student card shows the quota field.
  revalidatePath('/students')
  return { error: null }
}

// ─── Upload Logo ────────────────────────────────────────────────────────────

const MAX_LOGO_SIZE = 2 * 1024 * 1024 // 2 MB
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

function extFromMime(mime: string): string {
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  return 'jpg'
}

export async function uploadLogoAction(
  formData: FormData
): Promise<{ error: string | null; logoUrl?: string }> {
  const session = await getSession()

  if (session.role !== 'owner') {
    return { error: 'Unauthorized — owner only' }
  }

  try {
    requireMutation(session)
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Support mode — read only' }
  }

  const file = formData.get('file') as File | null
  if (!file || !(file instanceof File)) {
    return { error: 'No file provided' }
  }

  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return { error: 'Only PNG, JPEG and WebP images are allowed' }
  }

  if (file.size > MAX_LOGO_SIZE) {
    return { error: 'File too large — max 2 MB' }
  }

  const ext = extFromMime(file.type)
  const storagePath = `${session.orgId}/logo.${ext}`

  const db = createServiceRoleClient()

  const { error: uploadErr } = await db.storage
    .from('org-logos')
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: true,
    })

  if (uploadErr) {
    console.error('[settings/business-profile] Logo upload failed', {
      orgId: session.orgId,
      error: uploadErr.message,
    })
    return { error: 'Failed to upload logo' }
  }

  const { data: publicUrlData } = db.storage
    .from('org-logos')
    .getPublicUrl(storagePath)

  const logoUrl = publicUrlData.publicUrl

  const { error: updateErr } = await db
    .from('organizations')
    .update({ logo_url: logoUrl })
    .eq('id', session.orgId)

  if (updateErr) {
    console.error('[settings/business-profile] logo_url update failed', {
      orgId: session.orgId,
      error: updateErr.message,
    })
    return { error: 'Logo uploaded but failed to save URL' }
  }

  revalidatePath('/settings/business-profile')
  return { error: null, logoUrl }
}
