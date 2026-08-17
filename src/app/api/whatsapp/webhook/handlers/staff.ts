/**
 * Inbound handling for an org owner or admin writing to their own business
 * number.
 *
 * The real fix here is the negative one: before this path existed, an owner
 * texting their own number got "you are not registered with us", a lead row for
 * themselves, and a "new lead" notification pointing at /leads.
 *
 * Read-only.
 */

import { hasScheduleIntent } from '@/lib/whatsapp'
import { isActionAllowedForRole, type MenuAction } from '@/lib/whatsapp/menu'
import { OPEN_CHARGE_STATUSES } from '@/lib/charges'
import { getTodayRange } from '@/lib/lessons'
import { replyWith, type HandlerContext } from '../shared'

/** Routes a message from an owner/admin. Returns true when it was handled. */
export async function handleStaffMessage(
  ctx: HandlerContext,
  menuAction: MenuAction | null
): Promise<boolean> {
  if (ctx.sender.role !== 'staff') return false

  if (menuAction && !isActionAllowedForRole(menuAction, 'staff')) {
    await replyWith(ctx, 'action_not_for_role')
    return false
  }

  // "today_summary" is the only action, so a schedule-shaped question maps here
  // too — an owner asking "what's today" wants the summary.
  if (menuAction === 'today_summary' || (!menuAction && hasScheduleIntent(ctx.msg.text))) {
    await sendTodaySummary(ctx)
    return true
  }

  return false
}

async function sendTodaySummary(ctx: HandlerContext): Promise<void> {
  const { gte, lt } = getTodayRange(ctx.timezone)

  const [lessonsRes, cancelledRes, chargesRes] = await Promise.all([
    ctx.db
      .from('lessons')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', ctx.org.id)
      .neq('status', 'cancelled')
      .gte('start_at', gte)
      .lt('start_at', lt),
    ctx.db
      .from('lessons')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', ctx.org.id)
      .eq('status', 'cancelled')
      .gte('start_at', gte)
      .lt('start_at', lt),
    ctx.db
      .from('charges')
      .select('amount')
      .eq('organization_id', ctx.org.id)
      .in('status', [...OPEN_CHARGE_STATUSES]),
  ])

  if (lessonsRes.error || cancelledRes.error || chargesRes.error) {
    console.error('[whatsapp/webhook] Staff summary DB error', {
      orgId: ctx.org.id,
      error: lessonsRes.error ?? cancelledRes.error ?? chargesRes.error,
    })
    throw new Error('Failed to load staff daily summary')
  }

  const openBalance = ((chargesRes.data ?? []) as Array<{ amount: number }>).reduce(
    (sum, c) => sum + Number(c.amount),
    0
  )

  await replyWith(ctx, 'staff_summary_body', {
    lessons_today: String(lessonsRes.count ?? 0),
    cancellations_today: String(cancelledRes.count ?? 0),
    open_balance: openBalance.toFixed(2),
  })

  console.info('[whatsapp/webhook] Staff summary replied', { orgId: ctx.org.id })
}
