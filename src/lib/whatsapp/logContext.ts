/**
 * Ambient context for outbound WhatsApp logging.
 *
 * Roughly thirty call sites send WhatsApp messages, through the low-level
 * senders in ./index.ts and ./interactive.ts. Threading a "log this as bot / as
 * staff" argument through all of them — menus, cancellation, handlers,
 * reminders — would touch every one of those files for a feature none of them
 * care about.
 *
 * Instead the entry points (the webhook, sendSmartMessage, the dashboard's
 * manual-send action) declare who is speaking, and the senders read it back.
 * A send with no context in scope is simply not logged, which is the honest
 * answer for a caller nobody has taught to declare itself yet.
 */

import { AsyncLocalStorage } from 'async_hooks'

export type WaLogOrigin = 'bot' | 'ai' | 'staff' | 'cron'

export type WaLogContext = {
  /** Null until the conversation is known — see bindWaLogTarget. */
  orgId: string | null
  /** Recipient, normalized. The conversation key. Null until bound. */
  phone: string | null
  origin: WaLogOrigin
  /** Set for a staff member typing in the dashboard. */
  sentByProfileId?: string
}

const storage = new AsyncLocalStorage<WaLogContext>()

/** Runs `fn` with `ctx` visible to every send it performs, however deep. */
export function runWithWaLogContext<T>(ctx: WaLogContext, fn: () => T): T {
  return storage.run(ctx, fn)
}

/** The context in scope, or undefined when the caller declared none. */
export function getWaLogContext(): WaLogContext | undefined {
  return storage.getStore()
}

/**
 * Names the conversation this context belongs to.
 *
 * The webhook opens its context before it has resolved the org or normalized
 * the sender, so those arrive a few steps later. Until they do, sends are not
 * logged rather than logged against a guess.
 */
export function bindWaLogTarget(orgId: string, phone: string): void {
  const ctx = storage.getStore()
  if (!ctx) return
  ctx.orgId = orgId
  ctx.phone = phone
}

/**
 * Re-labels the current context.
 *
 * The webhook opens one context per message, as 'bot', before it knows whether
 * the reply will come from a deterministic handler or the AI assistant. The AI
 * branch calls this so its reply is filed as 'ai' — the distinction is visible
 * in the thread, and it is what tells an owner reading a bad answer which
 * system produced it.
 */
export function setWaLogOrigin(origin: WaLogOrigin): void {
  const ctx = storage.getStore()
  if (ctx) ctx.origin = origin
}
