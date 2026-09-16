/**
 * The `{{pack_line}}` fragment of the WhatsApp balance reply (decision #46, M2):
 * what is left on the family's usable cards. Empty when there is nothing to say.
 *
 * Never throws — a balance reply must not fail because the card lookup did.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { botString } from '@/lib/whatsapp/strings'
import type { AppLocale } from '@/lib/i18n/locale'

export async function buildParentPackLine(orgId: string, parentId: string, locale: AppLocale): Promise<string> {
  try {
    const db = createServiceRoleClient()
    const { data: relations } = await db
      .from('relationships')
      .select('student_id')
      .eq('organization_id', orgId)
      .eq('parent_id', parentId)
    const studentIds = (relations ?? []).map((r) => r.student_id as string)

    const { data: packs, error } = await db
      .from('lesson_pack_balances')
      .select('name, remaining, total_credits, valid_until')
      .eq('organization_id', orgId)
      .is('cancelled_at', null)
      .not('activated_at', 'is', null)
      .gt('remaining', 0)
      .or(
        studentIds.length > 0
          ? `parent_id.eq.${parentId},student_id.in.(${studentIds.join(',')})`
          : `parent_id.eq.${parentId}`
      )
    if (error) return ''

    const today = new Date().toISOString().slice(0, 10)
    const label = botString('balance_pack_label', locale)
    return ((packs ?? []) as Array<{ name: string; remaining: number; total_credits: number; valid_until: string | null }>)
      .filter((p) => !p.valid_until || p.valid_until >= today)
      .slice(0, 3)
      .map((p) => `\n${label} "${p.name}": ${Number(p.remaining)}/${Number(p.total_credits)}`)
      .join('')
  } catch {
    return ''
  }
}
