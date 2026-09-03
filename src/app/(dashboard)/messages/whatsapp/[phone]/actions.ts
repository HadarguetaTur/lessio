'use server'

import { revalidatePath } from 'next/cache'
import { getSession, requireMutation } from '@/lib/auth/session'
import { requireFeature } from '@/lib/saas/featureGate'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { decryptToken } from '@/lib/crypto'
import { sendTextMessage } from '@/lib/whatsapp'
import { isInSessionWindow } from '@/lib/whatsapp/sendSmart'
import { runWithWaLogContext } from '@/lib/whatsapp/logContext'
import { canTeacherAccessPhone } from '@/lib/whatsapp/conversations'
import { releaseTakeover, setTakeover } from '@/lib/whatsapp/takeover'
import { getTeacherByProfileId } from '@/lib/teachers'
import { commonError } from '@/lib/i18n/actionErrors'
import { getTranslations } from 'next-intl/server'

export type SendResult = { error: string | null }

/** Meta's hard cap on a text message body. */
const MESSAGE_MAX = 4096

/**
 * Sends a staff member's own words into a WhatsApp conversation, and hands the
 * conversation to them: the bot stays quiet until the takeover lapses, so the
 * parent does not get a menu underneath a human answer.
 *
 * Free-form text is only legal inside Meta's 24h customer-service window. The
 * composer is disabled when it is closed; this re-checks, because a window can
 * close between rendering the page and pressing send.
 */
export async function sendStaffMessageAction(
  phone: string,
  _prev: SendResult,
  formData: FormData
): Promise<SendResult> {
  const t = await getTranslations('waConversations')
  const session = await getSession()

  // Both of these throw to unwind (redirect / support-mode), so they stay
  // outside the try below.
  await requireFeature(session.orgId, 'whatsapp_automation')

  try {
    requireMutation(session)
  } catch {
    return { error: await commonError('supportModeReadOnly') }
  }

  const access = await assertConversationAccess(session.orgId, session.role, session.userId, phone)
  if (!access) return { error: t('errors.notFound') }

  const body = (formData.get('body') as string | null)?.trim()
  if (!body) return { error: t('errors.empty') }
  if (body.length > MESSAGE_MAX) return { error: t('errors.tooLong') }

  if (!(await isInSessionWindow(session.orgId, phone))) {
    return { error: t('errors.windowClosed') }
  }

  const db = createServiceRoleClient()
  const { data: org } = await db
    .from('organizations')
    .select('whatsapp_phone_number_id, whatsapp_access_token')
    .eq('id', session.orgId)
    .single()

  const encryptedToken = (org?.whatsapp_access_token as string | null) ?? null
  const phoneNumberId = (org?.whatsapp_phone_number_id as string | null) ?? null
  if (!encryptedToken || !phoneNumberId) return { error: t('errors.notConnected') }

  try {
    const accessToken = decryptToken(encryptedToken)

    // No opt-out gate here, unlike the proactive senders: this is a reply
    // inside an open conversation window, the same posture the bot's own
    // replies take. prepareBusinessSend guards business-INITIATED messages.
    await runWithWaLogContext(
      { orgId: session.orgId, phone, origin: 'staff', sentByProfileId: session.profileId },
      () => sendTextMessage(phone, body, accessToken, phoneNumberId)
    )
  } catch (err) {
    console.error('[messages/whatsapp] manual send failed', { orgId: session.orgId, err })
    return { error: t('errors.sendFailed') }
  }

  // Only after the message actually went out: a failed send should not silence
  // the bot on a conversation nobody ended up answering.
  await setTakeover(session.orgId, phone, session.profileId)

  revalidatePath(`/messages/whatsapp/${encodeURIComponent(phone)}`)
  revalidatePath('/messages/whatsapp')
  return { error: null }
}

/** Hands the conversation back to the bot. */
export async function releaseTakeoverAction(phone: string): Promise<SendResult> {
  const session = await getSession()

  try {
    requireMutation(session)
  } catch {
    return { error: await commonError('supportModeReadOnly') }
  }

  const t = await getTranslations('waConversations')
  const access = await assertConversationAccess(session.orgId, session.role, session.userId, phone)
  if (!access) return { error: t('errors.notFound') }

  await releaseTakeover(session.orgId, phone)

  revalidatePath(`/messages/whatsapp/${encodeURIComponent(phone)}`)
  revalidatePath('/messages/whatsapp')
  return { error: null }
}

/**
 * A teacher may only act on conversations with parents of their own students —
 * the same reach the list grants them, re-checked here because a phone number
 * in a URL is client input.
 */
async function assertConversationAccess(
  orgId: string,
  role: string,
  userId: string,
  phone: string
): Promise<boolean> {
  if (role !== 'teacher') return true

  const teacher = await getTeacherByProfileId(userId, orgId, { activeOnly: true })
  if (!teacher) return false

  return canTeacherAccessPhone(orgId, teacher.id, phone)
}
