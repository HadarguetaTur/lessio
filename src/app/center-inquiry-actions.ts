'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { normalizePhone, PhoneNormalizationError } from '@/lib/phone'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { readRequestAttribution } from '@/lib/attribution/server'
import { stampLandingConversion } from '@/lib/landing-analytics/conversion'
import type { AttributionTouch } from '@/lib/attribution'

const inquirySchema = z.object({
  contactName: z.string().trim().min(1).max(200),
  phone: z.string().trim().min(5).max(30),
})

export type CenterInquiryInput = z.infer<typeof inquirySchema>
export type CenterInquiryResult = { ok: true } | { error: 'INVALID_INPUT' | 'INVALID_PHONE' | 'SAVE_FAILED' }

/** Where an anonymous enquiry came from. Never accepted from the client. */
type InquiryOrigin = { touch: AttributionTouch | null; visitorId: string | null }

/** Records a Center enquiry in the platform CRM, optionally tied to an existing org. */
export async function createCenterPlanInquiry(
  input: CenterInquiryInput,
  organizationId: string | null = null
): Promise<CenterInquiryResult> {
  return saveInquiry(input, organizationId, null)
}

async function saveInquiry(
  input: CenterInquiryInput,
  organizationId: string | null,
  origin: InquiryOrigin | null
): Promise<CenterInquiryResult> {
  const parsed = inquirySchema.safeParse(input)
  if (!parsed.success) return { error: 'INVALID_INPUT' }

  let phone: string
  try {
    phone = normalizePhone(parsed.data.phone)
  } catch (error) {
    if (error instanceof PhoneNormalizationError) return { error: 'INVALID_PHONE' }
    throw error
  }

  const db = createServiceRoleClient()
  const note = 'Center plan enquiry'

  if (organizationId) {
    const { data: existing } = await db
      .from('platform_leads')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('source', 'plan_inquiry')
      .in('status', ['new', 'contacted', 'qualified'])
      .maybeSingle()

    if (existing) {
      const { error } = await db
        .from('platform_leads')
        .update({ name: parsed.data.contactName, phone, notes: note })
        .eq('id', existing.id)
      if (error) return { error: 'SAVE_FAILED' }
      revalidatePath('/admin/leads')
      return { ok: true }
    }
  }

  // `source` stays 'plan_inquiry' — it names the form, and the dedupe above keys
  // on it. Which post the visitor arrived from goes in medium/campaign/content.
  const touch = origin?.touch ?? null
  const cameFrom = [touch?.source, touch?.medium].filter(Boolean).join(' / ')
  const { data: lead, error } = await db
    .from('platform_leads')
    .insert({
      name: parsed.data.contactName,
      phone,
      status: 'new',
      source: 'plan_inquiry',
      medium: cameFrom || 'website',
      campaign: touch?.campaign ?? null,
      content: touch?.content ?? null,
      visitor_id: origin?.visitorId ?? null,
      notes: note,
      organization_id: organizationId,
    })
    .select('id')
    .single()
  if (error || !lead) return { error: 'SAVE_FAILED' }

  await stampLandingConversion({ visitorId: origin?.visitorId ?? null, leadId: lead.id as string })

  revalidatePath('/admin/leads')
  return { ok: true }
}

/** Public landing-page action: intentionally has no session requirement. */
export async function submitPublicCenterPlanInquiry(input: CenterInquiryInput): Promise<CenterInquiryResult> {
  const { lastTouch, visitorId } = await readRequestAttribution()
  return saveInquiry(input, null, { touch: lastTouch, visitorId })
}
