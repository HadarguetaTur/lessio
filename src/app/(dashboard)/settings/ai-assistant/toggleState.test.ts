import { describe, it, expect } from 'vitest'
import { resolveAiToggleState } from './toggleState'

describe('resolveAiToggleState', () => {
  it('configured and on — switch works, no warning', () => {
    expect(resolveAiToggleState({ isConfigured: true, currentlyEnabled: true })).toEqual({
      disabled: false,
      onButNotAnswering: false,
    })
  })

  it('configured and off — switch works, no warning', () => {
    expect(resolveAiToggleState({ isConfigured: true, currentlyEnabled: false })).toEqual({
      disabled: false,
      onButNotAnswering: false,
    })
  })

  it('not configured but on — the state the audit found in production', () => {
    // Turning it back off must stay possible: this is the way out.
    expect(resolveAiToggleState({ isConfigured: false, currentlyEnabled: true })).toEqual({
      disabled: false,
      onButNotAnswering: true,
    })
  })

  it('not configured and off — nothing to turn on yet', () => {
    // The one disabled state, and the amber key-missing banner explains it.
    expect(resolveAiToggleState({ isConfigured: false, currentlyEnabled: false })).toEqual({
      disabled: true,
      onButNotAnswering: false,
    })
  })

  it('never reports a warning while the provider is configured', () => {
    for (const currentlyEnabled of [true, false]) {
      expect(
        resolveAiToggleState({ isConfigured: true, currentlyEnabled }).onButNotAnswering
      ).toBe(false)
    }
  })
})
