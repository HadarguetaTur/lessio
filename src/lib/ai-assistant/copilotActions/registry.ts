/**
 * The copilot action whitelist. An action the classifier names but this map
 * does not carry simply does not exist — the driver falls back to answering
 * the message as a question.
 *
 * Growing the secretary = adding a CopilotActionDef here (plus its classifier
 * prompt line in copilot.ts). Nothing else in the pipeline changes.
 */

import type { CopilotActionDef } from './types'
import { sendDebtReminderAll, sendDebtReminderParent } from './debtReminders'

const COPILOT_ACTIONS: Record<string, CopilotActionDef> = {
  [sendDebtReminderAll.name]: sendDebtReminderAll,
  [sendDebtReminderParent.name]: sendDebtReminderParent,
}

export const COPILOT_WRITE_ACTION_NAMES = Object.freeze(Object.keys(COPILOT_ACTIONS))

export function getCopilotAction(name: string): CopilotActionDef | null {
  return COPILOT_ACTIONS[name] ?? null
}
