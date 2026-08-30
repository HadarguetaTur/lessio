import { describe, expect, it } from 'vitest'

import {
  decodeCopilotPayload,
  encodeCopilotPayload,
  type CopilotConfirmPayload,
} from './copilotPayloads'

const PARENT_ID = '0142401d-89d0-47ad-bd3f-20edfb4ca444'

describe('copilot payload round-trips', () => {
  it('survives every confirmation the copilot can offer', () => {
    const payloads: CopilotConfirmPayload[] = [
      { action: 'cancel' },
      { action: 'confirm', kind: 'send_debt_reminder_all' },
      { action: 'confirm', kind: 'send_debt_reminder_parent', parentId: PARENT_ID },
    ]

    for (const payload of payloads) {
      const encoded =
        payload.action === 'cancel'
          ? encodeCopilotPayload('cancel')
          : encodeCopilotPayload('confirm', payload.kind, payload.parentId)

      expect(decodeCopilotPayload(encoded), encoded).toEqual(payload)
    }
  })

  it('stays well inside Meta’s reply-id length limit', () => {
    const longest = encodeCopilotPayload('confirm', 'send_debt_reminder_parent', PARENT_ID)
    expect(longest.length).toBeLessThan(80)
  })
})

describe('decodeCopilotPayload', () => {
  it('ignores payloads that belong to another namespace', () => {
    // Falling through matters: every other flow's ids reach the same handler.
    expect(decodeCopilotPayload(undefined)).toBeNull()
    expect(decodeCopilotPayload('')).toBeNull()
    expect(decodeCopilotPayload('m:book')).toBeNull()
    expect(decodeCopilotPayload('sup:send')).toBeNull()
    expect(decodeCopilotPayload('c:pick:3')).toBeNull()
    expect(decodeCopilotPayload('cp')).toBeNull()
  })

  it('rejects an action it does not know', () => {
    // The decoder is the only thing standing between a crafted reply id and a
    // send, so an unrecognised action must not fall through to a default.
    expect(decodeCopilotPayload('cp:confirm:launch_missiles')).toBeNull()
    expect(decodeCopilotPayload('cp:confirm')).toBeNull()
    expect(decodeCopilotPayload('cp:approve:send_debt_reminder_all')).toBeNull()
  })

  it('rejects the wrong arity for each action', () => {
    expect(decodeCopilotPayload('cp:cancel:extra')).toBeNull()
    expect(decodeCopilotPayload('cp:confirm:send_debt_reminder_all:extra')).toBeNull()
    expect(decodeCopilotPayload(`cp:confirm:send_debt_reminder_parent:${PARENT_ID}:extra`)).toBeNull()
  })

  it('rejects a per-parent confirmation with no parent', () => {
    expect(decodeCopilotPayload('cp:confirm:send_debt_reminder_parent')).toBeNull()
    expect(decodeCopilotPayload('cp:confirm:send_debt_reminder_parent:')).toBeNull()
  })

  it('passes the parent id through untouched for the caller to re-check', () => {
    // Shape is not validated here on purpose — staff.ts re-checks the id
    // against the org's own debtor rows before anything is sent.
    expect(decodeCopilotPayload('cp:confirm:send_debt_reminder_parent:not-a-uuid')).toEqual({
      action: 'confirm',
      kind: 'send_debt_reminder_parent',
      parentId: 'not-a-uuid',
    })
  })
})
