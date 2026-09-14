'use server'

import { revalidatePath } from 'next/cache'
import { getSession, requireMutation } from '@/lib/auth/session'
import { requireFeature, assertFeature, FeatureNotAvailableError } from '@/lib/saas/featureGate'
import { createCampaign } from '@/lib/whatsapp/broadcast/create'
import { PARAM_LIMITS } from '@/lib/whatsapp/approvedTemplates'
import { getConversationHeader } from '@/lib/whatsapp/conversations'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { decryptToken } from '@/lib/crypto'
import { sendTextMessage } from '@/lib/whatsapp'
import { isInSessionWindow } from '@/lib/whatsapp/sendSmart'
import { runWithWaLogContext } from '@/lib/whatsapp/logContext'
import { canTeacherAccessPhone } from '@/lib/whatsapp/conversations'
import { releaseTakeover, setTakeover } from '@/lib/whatsapp/takeover'
import { getTeacherByProfileId } from '@/lib/teachers'
import { mutationBlockedError } from '@/lib/i18n/actionErrors'
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
  } catch (err) {
    return { error: await mutationBlockedError(err) }
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
  revalidatePath('/messages')
  return { error: null }
}

/** Hands the conversation back to the bot. */
export async function releaseTakeoverAction(phone: string): Promise<SendResult> {
  const session = await getSession()

  try {
    requireMutation(session)
  } catch (err) {
    return { error: await mutationBlockedError(err) }
  }

  const t = await getTranslations('waConversations')
  const access = await assertConversationAccess(session.orgId, session.role, session.userId, phone)
  if (!access) return { error: t('errors.notFound') }

  await releaseTakeover(session.orgId, phone)

  revalidatePath(`/messages/whatsapp/${encodeURIComponent(phone)}`)
  revalidatePath('/messages')
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

/**
 * Silences the bot on this conversation so a person can answer.
 *
 * Until now this happened only as a side effect of sending a message, and
 * nothing in the product said so — an owner who wanted to step in had no way to
 * do it, and no way to know she already had. Making it a button is the point:
 * "I am handling this one" is a decision, not a by-product of typing.
 *
 * The hold lapses on its own after TAKEOVER_DURATION_HOURS, and every staff
 * message restarts that clock, so a forgotten takeover cannot mute the bot
 * forever.
 */
export async function takeOverConversationAction(phone: string): Promise<SendResult> {
  const session = await getSession()

  try {
    requireMutation(session)
  } catch (err) {
    return { error: await mutationBlockedError(err) }
  }

  const t = await getTranslations('waConversations')
  const access = await assertConversationAccess(session.orgId, session.role, session.userId, phone)
  if (!access) return { error: t('errors.notFound') }

  await setTakeover(session.orgId, phone, session.profileId)

  revalidatePath(`/messages/whatsapp/${encodeURIComponent(phone)}`)
  revalidatePath('/messages')
  return { error: null }
}

export type ClosedWindowResult = {
  error: string | null
  /** Set when the number's guard refused — the thread explains it in place. */
  guardReason?: string
  sent?: boolean
}

/**
 * Reaches a parent after Meta's 24h window has closed.
 *
 * Free text is illegal outside the window; only an approved template may go.
 * The composer used to vanish at that point and leave a sentence saying so —
 * which is exactly when an owner most needs to say something ("tomorrow's
 * lesson is moved"). This sends that sentence as a `class_update`, the
 * approved service-update template, addressed to one parent.
 *
 * It is a campaign of one on purpose: the guard, consent, opt-out, quota,
 * retries and the transcript entry all come from the broadcast engine rather
 * than being reimplemented here. A teacher may use it for the families she can
 * already see — a service update to her own lessons' parents, which is what
 * decision #42 allows her.
 */
export async function sendClassUpdateToOneAction(
  phone: string,
  _prev: ClosedWindowResult,
  formData: FormData
): Promise<ClosedWindowResult> {
  const session = await getSession()

  try {
    requireMutation(session)
  } catch (err) {
    return { error: await mutationBlockedError(err) }
  }

  const t = await getTranslations('inbox.thread')

  // assertFeature, not requireFeature: a redirect to billing from inside a
  // conversation would throw away what she just typed.
  try {
    await assertFeature(session.orgId, 'broadcasts')
  } catch (err) {
    if (err instanceof FeatureNotAvailableError) return { error: t('errors.notOnPlan') }
    throw err
  }

  const access = await assertConversationAccess(session.orgId, session.role, session.userId, phone)
  if (!access) return { error: t('errors.notFound') }

  const header = await getConversationHeader(session.orgId, phone)
  if (!header.parentId) return { error: t('errors.notAParent') }

  const topic = String(formData.get('topic') ?? '').trim()
  // Meta collapses whitespace inside a template parameter, so the preview and
  // the limit are both measured on the flattened text.
  const message = String(formData.get('message') ?? '').replace(/\s+/g, ' ').trim()

  if (!message) return { error: t('errors.empty') }
  if (message.length > PARAM_LIMITS.broadcast_message) return { error: t('errors.tooLong') }
  if (topic.length > PARAM_LIMITS.broadcast_topic) return { error: t('errors.topicTooLong') }

  const result = await createCampaign({
    orgId: session.orgId,
    profileId: session.profileId,
    role: session.role,
    name: t('campaignName', { name: header.displayName ?? phone }),
    type: 'class_update',
    topic: topic || null,
    message,
    audience: { kind: 'manual', parentIds: [header.parentId] },
    subscriptionLapsed: session.isSaasReadOnly === true,
  })

  revalidatePath(`/messages/whatsapp/${encodeURIComponent(phone)}`)
  revalidatePath('/messages')

  if (!result.ok) {
    if (result.error === 'BLOCKED') return { error: null, guardReason: result.guardReason }
    if (result.error === 'QUOTA_EXCEEDED') return { error: t('errors.quota') }
    return { error: t('errors.sendFailed') }
  }

  // Zero recipients means the consent rules removed the only one — an opted-out
  // parent. Saying "sent" would be a lie.
  if (result.recipients === 0) return { error: t('errors.optedOut') }

  return { error: null, sent: true }
}
