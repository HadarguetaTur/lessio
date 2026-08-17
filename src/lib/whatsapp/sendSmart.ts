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
import type { AppLocale } from '@/lib/i18n/locale'
import { resolveTemplate, type MessageTemplateType } from './templates'
import { sendTextMessage, sendTemplateMessage } from './index'
import { getApprovedTemplate } from './approvedTemplates'
import { isOptedOut } from './optOut'

/** Why a send did not happen. `sent: true` means it was handed to Meta. */
export type SmartSendResult = { sent: true } | { sent: false; reason: 'opted_out' }

/**
 * Sends a WhatsApp message using the correct method based on whether the
 * 24h customer-service window is open.
 *
 * Every caller is business-initiated (reminders, notifications, dashboard
 * buttons), so this is the enforcement point for opt-out. Direct replies to an
 * inbound message do not come through here and are never blocked.
 */
export async function sendSmartMessage(params: {
  orgId: string
  phone: string
  accessToken: string
  phoneNumberId: string
  templateType: MessageTemplateType
  vars: Record<string, string>
  locale?: AppLocale
}): Promise<SmartSendResult> {
  const { orgId, phone, accessToken, phoneNumberId, templateType, vars, locale = 'he' } = params

  if (await isOptedOut(orgId, phone)) {
    console.info('[sendSmart] Recipient opted out — not sending', { orgId, templateType })
    return { sent: false, reason: 'opted_out' }
  }

  const inWindow = await isInSessionWindow(orgId, phone)

  if (inWindow) {
    // Within 24h window — send customisable text message
    const body = await resolveTemplate(orgId, templateType, vars, locale)
    await sendTextMessage(phone, body, accessToken, phoneNumberId)
    return { sent: true }
  }

  // Outside window — use the approved template in the recipient's language,
  // falling back to the Hebrew one. Falling back to TEXT here would fail with
  // error 131047, so an approved template in the wrong language still beats it.
  const approved = getApprovedTemplate(templateType, locale) ?? getApprovedTemplate(templateType, 'he')

  if (approved) {
    const components = approved.buildComponents(vars)
    await sendTemplateMessage(phone, accessToken, phoneNumberId, approved.name, approved.languageCode, components)
    return { sent: true }
  }

  // Fallback: no approved template registered — send text anyway
  // This may fail if the session window is truly closed, but ensures
  // the message is at least attempted.
  console.warn('[sendSmart] No approved template for type — falling back to text', {
    orgId,
    templateType,
  })
  const body = await resolveTemplate(orgId, templateType, vars, locale)
  await sendTextMessage(phone, body, accessToken, phoneNumberId)
  return { sent: true }
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
    .select('message_id')
    .eq('organization_id', orgId)
    .eq('phone', phone)
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
