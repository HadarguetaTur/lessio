/**
 * What the AI assistant switch is allowed to do, and what it should look like.
 *
 * Extracted from AiAssistantForm so the three states can be asserted directly:
 * the audit found a tenant sitting in `on` with no API key, where the page drew
 * a healthy blue switch over an assistant that had never answered a message.
 */

export type AiToggleState = {
  /** Turning the switch on without a key would be a lie, so it is blocked. */
  disabled: boolean
  /** On, but there is no key behind it — nothing is actually being answered. */
  onButNotAnswering: boolean
}

export function resolveAiToggleState(input: {
  isConfigured: boolean
  currentlyEnabled: boolean
}): AiToggleState {
  const { isConfigured, currentlyEnabled } = input
  return {
    // Off and unconfigured is the one dead end, and it is the coherent one:
    // there is nothing to turn on yet, and the amber banner says so. Turning
    // *off* is always allowed — that is the way out of "on but not answering".
    disabled: !isConfigured && !currentlyEnabled,
    onButNotAnswering: currentlyEnabled && !isConfigured,
  }
}
