/**
 * The first two copilot actions — debt reminders — ported behavior-identical
 * from the literal registry that used to live in the webhook's staff handler.
 * The whitelist started here (decisions.md #26, amendment 2026-08-30) and this
 * module is now just the same logic behind the generic CopilotActionDef shape.
 */

import { z } from 'zod'
import { getDebtorsOverview } from '@/lib/charges/debtors'
import {
  sendDebtReminderForParent,
  type ReminderOutcome,
} from '@/lib/payment-request/sendManualReminder'
import { botString } from '@/lib/whatsapp/strings'
import type { CopilotActionDef, CopilotActionRunCtx } from './types'

/** Debt reminders go out in batches so a big org does not fan out all at once. */
const REMINDER_BATCH_SIZE = 5

export const sendDebtReminderAll: CopilotActionDef = {
  name: 'send_debt_reminder_all',
  paramsSchema: z.object({}).strict(),

  async propose(ctx) {
    const eligible = await loadEligibleDebtors(ctx)
    if (eligible.length === 0) {
      return { kind: 'reply', body: botString('copilot_no_debtors', ctx.locale) }
    }
    return {
      kind: 'confirm',
      body: botString('copilot_confirm_all', ctx.locale, { count: String(eligible.length) }),
    }
  },

  async execute(ctx) {
    // Re-derived at tap time — the debtor list may have changed since propose,
    // and the reminder must go to who owes money now, not who owed it then.
    const eligible = await loadEligibleDebtors(ctx)

    let sent = 0
    let skipped = 0
    let failed = 0

    // Batched rather than one Promise.all: a large org would otherwise open a
    // send per debtor at once, and one rejection would abandon the rest.
    for (let i = 0; i < eligible.length; i += REMINDER_BATCH_SIZE) {
      const results = await Promise.allSettled(
        eligible
          .slice(i, i + REMINDER_BATCH_SIZE)
          .map((row) => sendDebtReminderForParent(ctx.orgId, row.parentId, ctx.actorProfileId))
      )

      for (const result of results) {
        if (result.status === 'rejected' || result.value === 'failed') failed += 1
        else if (result.value === 'sent') sent += 1
        else skipped += 1
      }
    }

    return {
      kind: 'done',
      body: botString('copilot_summary', ctx.locale, {
        sent: String(sent),
        skipped: String(skipped),
        failed: String(failed),
      }),
      audit: { sent, skipped, failed },
    }
  },
}

export const sendDebtReminderParent: CopilotActionDef = {
  name: 'send_debt_reminder_parent',
  paramsSchema: z.object({ parentId: z.string().min(1) }).strict(),

  async propose(ctx, params) {
    const parent = await findEligibleParent(ctx, params.parentId as string)
    // Not a known debtor (or opted out): the classifier guessed an id the org's
    // data does not back. Declining hands the message to the Q&A path, which
    // answers instead of pretending a reminder is possible.
    if (!parent) return { kind: 'decline' }

    return {
      kind: 'confirm',
      body: botString('copilot_confirm_parent', ctx.locale, {
        parent_name: parent.parentName || botString('the_parent', ctx.locale),
      }),
    }
  },

  async execute(ctx, params) {
    const parentId = params.parentId as string
    const parent = await findEligibleParent(ctx, parentId)
    if (!parent) {
      return { kind: 'reply', body: botString('copilot_reminder_not_sent', ctx.locale) }
    }

    let outcome: ReminderOutcome = 'failed'
    try {
      outcome = await sendDebtReminderForParent(ctx.orgId, parentId, ctx.actorProfileId)
    } catch (err) {
      console.error('[copilot/debt-reminders] Debt reminder failed', {
        orgId: ctx.orgId,
        err: String(err),
      })
    }

    return {
      kind: outcome === 'sent' ? 'done' : 'reply',
      body: botString(
        outcome === 'sent' ? 'copilot_reminder_sent' : 'copilot_reminder_not_sent',
        ctx.locale
      ),
      audit: { parentId, outcome },
    }
  },
}

async function loadEligibleDebtors(ctx: CopilotActionRunCtx) {
  const overview = await getDebtorsOverview(ctx.orgId)
  return overview.rows.filter((row) => !row.optedOut)
}

async function findEligibleParent(ctx: CopilotActionRunCtx, parentId: string) {
  const eligible = await loadEligibleDebtors(ctx)
  return eligible.find((row) => row.parentId === parentId) ?? null
}
