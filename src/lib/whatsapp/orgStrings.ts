/**
 * Org-authored overrides for bot strings.
 *
 * botString() answers "what does Lessio say"; this answers "what does THIS org
 * say", falling back to the former. Only the keys in CUSTOMIZABLE_BOT_STRINGS
 * can be overridden, and the whitelist is applied on read as well as on write:
 * a row that predates a key being un-whitelisted must not keep taking effect.
 *
 * Never throws. A lookup failure means the built-in string is used, which is
 * always a correct message — losing a custom label is not worth losing a send.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { AppLocale } from '@/lib/i18n/locale'
import { botString, type BotStringKey } from './strings'
import { CUSTOMIZABLE_BOT_STRINGS } from './templateButtons'

export type BotStringOverrides = Partial<Record<BotStringKey, string>>

const ALLOWED = new Set<string>(CUSTOMIZABLE_BOT_STRINGS)

/**
 * Every override an org has set for one language.
 *
 * Loaded once per inbound message and threaded through the senders, rather
 * than queried per label — a menu renders half a dozen of them.
 */
export async function getOrgBotStrings(
  orgId: string,
  locale: AppLocale
): Promise<BotStringOverrides> {
  try {
    const db = createServiceRoleClient()
    const { data, error } = await db
      .from('org_bot_strings')
      .select('key, value')
      .eq('organization_id', orgId)
      .eq('locale', locale)

    if (error) {
      console.warn('[orgStrings] Lookup failed — using built-in strings', {
        orgId,
        error: error.message,
      })
      return {}
    }

    const overrides: BotStringOverrides = {}
    for (const row of (data ?? []) as { key: string; value: string }[]) {
      if (ALLOWED.has(row.key)) overrides[row.key as BotStringKey] = row.value
    }
    return overrides
  } catch (err) {
    console.warn('[orgStrings] Lookup threw — using built-in strings', { orgId, err })
    return {}
  }
}

/**
 * A bot string with the org's own wording applied.
 *
 * Overrides are plain text, not templates: a label is a handful of words with
 * no variables in it, and letting one carry {{vars}} would mean an owner could
 * put an unresolved placeholder on a button. Anything needing substitution
 * goes through botString directly.
 */
export function resolveBotString(
  overrides: BotStringOverrides | undefined,
  key: BotStringKey,
  locale: AppLocale,
  vars: Record<string, string> = {}
): string {
  const override = overrides?.[key]
  if (override && ALLOWED.has(key)) return override
  return botString(key, locale, vars)
}
