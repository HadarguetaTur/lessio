/**
 * The copilot action contract — decisions.md #26, second amendment.
 *
 * The AI classifies a staff message into an action name plus raw params, and
 * its involvement ends there. Everything an action definition does is
 * deterministic code:
 *
 * - `propose` validates and resolves the params org-scoped and says what to
 *   send: a confirmation, a slot question, a disambiguation list, or a plain
 *   reply. It never writes.
 * - `execute` runs at confirm-tap time, in a *later* webhook invocation, so it
 *   receives only what survived in the session row — it re-resolves every
 *   entity from the DB and never trusts the proposal it cannot see.
 *
 * Definitions return strings; only the webhook driver sends messages. That
 * keeps every def testable without a WhatsApp mock.
 */

import type { ZodType } from 'zod'
import type { AppLocale } from '@/lib/i18n/locale'

/** What every propose/execute call knows about who is acting and where. */
export interface CopilotActionRunCtx {
  orgId: string
  actorProfileId: string
  locale: AppLocale
  timezone: string
}

/** One row of a disambiguation list. `patch` is merged into the session params when picked. */
export interface CopilotOption {
  title: string
  description?: string
  patch: Record<string, unknown>
}

export type CopilotProposeResult =
  /** Params are complete and resolved — ask for the confirm tap. */
  | { kind: 'confirm'; body: string }
  /** A param is missing — ask for it and keep collecting. */
  | { kind: 'ask_slot'; body: string; params: Record<string, unknown> }
  /** Several entities match — let them pick from a list. */
  | { kind: 'ambiguous'; body: string; options: CopilotOption[]; params: Record<string, unknown> }
  /** The request cannot map to this action (target not on the allowed list…) — fall back to answering. */
  | { kind: 'decline' }
  /** Nothing to do (e.g. no debtors) — reply and open no session. */
  | { kind: 'reply'; body: string }

export type CopilotExecuteResult =
  /** The action ran. `audit` is stored on the session row. */
  | { kind: 'done'; body: string; audit?: Record<string, unknown> }
  /** The action could not run (target vanished between propose and tap). */
  | { kind: 'reply'; body: string; audit?: Record<string, unknown> }

export interface CopilotActionDef {
  name: string
  /**
   * Strict validation boundary for classifier output and stored session
   * params. Reject-don't-strip: a param this schema does not know is a param
   * no executor should silently ignore.
   */
  paramsSchema: ZodType<Record<string, unknown>>
  propose(ctx: CopilotActionRunCtx, params: Record<string, unknown>): Promise<CopilotProposeResult>
  execute(ctx: CopilotActionRunCtx, params: Record<string, unknown>): Promise<CopilotExecuteResult>
}
