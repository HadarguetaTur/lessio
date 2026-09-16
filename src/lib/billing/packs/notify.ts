/**
 * Telling a parent their punch card is running low, and again when it is used
 * up (decision #46, M2).
 *
 * Off unless the org turned on `pack_notifications_enabled`. One message per
 * stage per card: the send is claimed in `notification_log`
 * (UNIQUE organization_id, type, entity_id) BEFORE it goes out, so a retried
 * completion or two lessons settling together cannot message twice. A failed
 * send marks the claim failed; the stage stamp on the card is written only on
 * success.
 *
 * Never throws — a notification must not fail the settlement that caused it.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { decryptToken } from '@/lib/crypto'
import { sendSmartMessage } from '@/lib/whatsapp/sendSmart'
import { resolveRecipientLocale } from '@/lib/i18n/locale'
import { getCollectionPolicyServiceRole } from '@/lib/cancellation-policy/service'

export type PackBalanceStage = 'pack_low_balance' | 'pack_exhausted'

/** Which message, if any, a balance calls for. Pure. */
export function packBalanceStage(
  remaining: number,
  threshold: number,
  alreadySent: { low: boolean; exhausted: boolean }
): PackBalanceStage | null {
  if (remaining <= 0) return alreadySent.exhausted ? null : 'pack_exhausted'
  if (remaining <= threshold) return alreadySent.low ? null : 'pack_low_balance'
  return null
}

export async function notifyPackBalances(organizationId: string, packIds: readonly string[]): Promise<void> {
  const unique = [...new Set(packIds)]
  if (unique.length === 0) return
  try {
    const policy = await getCollectionPolicyServiceRole(organizationId)
    if (!policy.packNotificationsEnabled) return

    const db = createServiceRoleClient()
    const [{ data: org }, { data: packs }] = await Promise.all([
      db
        .from('organizations')
        .select('whatsapp_phone_number_id, whatsapp_access_token, default_locale')
        .eq('id', organizationId)
        .maybeSingle(),
      db
        .from('lesson_pack_balances')
        .select('id, name, remaining, parent_id, student_id, billing_student_id, cancelled_at, activated_at, low_balance_notified_at, exhausted_notified_at')
        .eq('organization_id', organizationId)
        .in('id', unique),
    ])
    if (!org?.whatsapp_access_token || !org.whatsapp_phone_number_id) return

    for (const pack of (packs ?? []) as Array<{
      id: string
      name: string
      remaining: number
      parent_id: string
      student_id: string | null
      billing_student_id: string | null
      cancelled_at: string | null
      activated_at: string | null
      low_balance_notified_at: string | null
      exhausted_notified_at: string | null
    }>) {
      if (pack.cancelled_at || !pack.activated_at) continue
      const stage = packBalanceStage(Number(pack.remaining), policy.packLowBalanceThreshold, {
        low: Boolean(pack.low_balance_notified_at),
        exhausted: Boolean(pack.exhausted_notified_at),
      })
      if (!stage) continue
      await sendStage(db, organizationId, org, pack, stage)
    }
  } catch (err) {
    console.error('[packs/notify] failed', { organizationId, packIds: unique, err })
  }
}

async function sendStage(
  db: ReturnType<typeof createServiceRoleClient>,
  organizationId: string,
  org: { whatsapp_phone_number_id: string; whatsapp_access_token: string; default_locale: string | null },
  pack: { id: string; name: string; remaining: number; parent_id: string; student_id: string | null; billing_student_id: string | null },
  stage: PackBalanceStage
): Promise<void> {
  const { error: claimError } = await db.from('notification_log').insert({
    organization_id: organizationId,
    type: stage,
    entity_id: pack.id,
    status: 'pending',
  })
  if (claimError) {
    if (claimError.code !== '23505') {
      console.error('[packs/notify] claim failed', { organizationId, packId: pack.id, stage, error: claimError.message })
    }
    return
  }

  const finish = async (status: 'sent' | 'failed', message?: string) => {
    await db
      .from('notification_log')
      .update({ status, error_message: message?.slice(0, 500) ?? null })
      .eq('organization_id', organizationId)
      .eq('type', stage)
      .eq('entity_id', pack.id)
  }

  const studentId = pack.student_id ?? pack.billing_student_id
  const [{ data: parent }, { data: student }] = await Promise.all([
    db.from('parents').select('full_name, phone, preferred_locale').eq('id', pack.parent_id).eq('organization_id', organizationId).maybeSingle(),
    studentId
      ? db.from('students').select('full_name').eq('id', studentId).eq('organization_id', organizationId).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  if (!parent?.phone) {
    await finish('failed', 'parent has no phone')
    return
  }

  try {
    const locale = resolveRecipientLocale({
      stored: (parent.preferred_locale as string | null) ?? null,
      orgDefault: org.default_locale,
    })
    const result = await sendSmartMessage({
      orgId: organizationId,
      phone: parent.phone as string,
      accessToken: decryptToken(org.whatsapp_access_token),
      phoneNumberId: org.whatsapp_phone_number_id,
      templateType: stage,
      vars: {
        parent_name: (parent.full_name as string) ?? '',
        student_name: (student?.full_name as string | undefined) ?? '',
        pack_name: pack.name,
        remaining: String(Math.max(0, Number(pack.remaining))),
      },
      locale,
    })
    if (!result.sent) {
      await finish('failed', 'opted out')
      return
    }
    await finish('sent')
    await db
      .from('lesson_packs')
      .update(stage === 'pack_exhausted' ? { exhausted_notified_at: new Date().toISOString() } : { low_balance_notified_at: new Date().toISOString() })
      .eq('id', pack.id)
      .eq('organization_id', organizationId)
  } catch (err) {
    await finish('failed', err instanceof Error ? err.message : String(err))
  }
}
