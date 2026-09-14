'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { normalizePhone, PhoneNormalizationError } from '@/lib/phone'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

const inquirySchema = z.object({
  contactName: z.string().trim().min(1).max(200),
  phone: z.string().trim().min(5).max(30),
})

export type CenterInquiryInput = z.infer<typeof inquirySchema>
export type CenterInquiryResult = { ok: true } | { error: 'INVALID_INPUT' | 'INVALID_PHONE' | 'SAVE_FAILED' }

/** Records a Center enquiry in the platform CRM, optionally tied to an existing org. */
export async function createCenterPlanInquiry(
  input: CenterInquiryInput,
  organizationId: string | null = null
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

  const { error } = await db.from('platform_leads').insert({
    name: parsed.data.contactName,
    phone,
    status: 'new',
    source: 'plan_inquiry',
    medium: 'website',
    notes: note,
    organization_id: organizationId,
  })
  if (error) return { error: 'SAVE_FAILED' }

  revalidatePath('/admin/leads')
  return { ok: true }
}

/** Public landing-page action: intentionally has no session requirement. */
export async function submitPublicCenterPlanInquiry(input: CenterInquiryInput): Promise<CenterInquiryResult> {
  return createCenterPlanInquiry(input)
}
