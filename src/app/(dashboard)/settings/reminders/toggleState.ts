/**
 * Whether the reminders master switch is telling the truth.
 *
 * The audit found a tenant with `reminders_enabled = true` (the schema default,
 * so every new org starts here) and no WhatsApp number, where the page drew a
 * healthy switch, an hours dropdown and a "settings saved" toast over an
 * organization whose parents had never received a single reminder.
 *
 * Sibling of ../ai-assistant/toggleState.ts, with one deliberate difference:
 * that one can disable the switch, this one never does. The AI assistant ships
 * off, so "off and unconfigured" is a coherent dead end. Reminders ship *on*,
 * so disabling the control would trap an owner who wants to turn them off —
 * and turning them off is a legitimate choice whether or not WhatsApp is
 * connected. The fix here is the sentence, not the lock.
 */

export type RemindersToggleState = {
  /** On, but there is no connected number to send through — nothing goes out. */
  onButNotSending: boolean
}

export function resolveRemindersToggleState(input: {
  hasWhatsApp: boolean
  currentlyEnabled: boolean
}): RemindersToggleState {
  const { hasWhatsApp, currentlyEnabled } = input
  return {
    onButNotSending: currentlyEnabled && !hasWhatsApp,
  }
}
