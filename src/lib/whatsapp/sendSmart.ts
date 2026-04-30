/**
 * Session-window aware WhatsApp message sender.
 * Per /docs/sprint-23-scope.md § Story 4b.
 *
 * Algorithm:
 *   1. Check whatsapp_processed_messages for a row from `phone` in `orgId`
 *      within the last 24 hours.
 *   2. Within window  → sendTextMessage (customisable org template body)
 *   3. Outside window → sendTemplateMessage (Meta-approved template)
 *
 * Falls back to sendTextMessage if no approved template is registered for
 * the given templateType (fail-safe — still sends something).
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { resolveTemplate, type MessageTemplateType } from './templates'
import { sendTextMessage, sendTemplateMessage } from './index'
import { getApprovedTemplate } from './approvedTemplates'

/**
 * Sends a WhatsApp message using the correct method based on whether the
 * 24h customer-service window is open.
 */
export async function sendSmartMessage(params: {
  orgId: string
  phone: string
  accessToken: string
  phoneNumberId: string
  templateType: MessageTemplateType
  vars: Record<string, string>
}): Promise<void> {
  const { orgId, phone, accessToken, phoneNumberId, templateType, vars } = params

  const inWindow = await isInSessionWindow(orgId, phone)

  if (inWindow) {
    // Within 24h window — send customisable text message
    const body = await resolveTemplate(orgId, templateType, vars)
    await sendTextMessage(phone, body, accessToken, phoneNumberId)
    return
  }

  // Outside window — use Meta-approved template if available
  const approved = getApprovedTemplate(templateType)

  if (approved) {
    const components = approved.buildComponents(vars)
    await sendTemplateMessage(phone, accessToken, phoneNumberId, approved.name, approved.languageCode, components)
    return
  }

  // Fallback: no approved template registered — send text anyway
  // This may fail if the session window is truly closed, but ensures
  // the message is at least attempted.
  console.warn('[sendSmart] No approved template for type — falling back to text', {
    orgId,
    templateType,
  })
  const body = await resolveTemplate(orgId, templateType, vars)
  await sendTextMessage(phone, body, accessToken, phoneNumberId)
}

/**
 * Returns true if there is a recorded inbound message from `phone` in `orgId`
 * within the last 24 hours (Meta customer-service window is open).
 */
async function isInSessionWindow(orgId: string, phone: string): Promise<boolean> {
  const db = createServiceRoleClient()
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await db
    .from('whatsapp_processed_messages')
    .select('id')
    .eq('organization_id', orgId)
    .eq('from_phone', phone)
    .gt('created_at', cutoff)
    .limit(1)
    .maybeSingle()

  if (error) {
    console.warn('[sendSmart] Session window check failed — assuming closed', {
      orgId,
      error: error.message,
    })
    return false
  }

  return data !== null
}
