import { describe, expect, it } from 'vitest'

import {
  decodeCopilotPayload,
  encodeCopilotPayload,
  encodeCopilotSessionPayload,
} from './copilotPayloads'

const PARENT_ID = '0142401d-89d0-47ad-bd3f-20edfb4ca444'
const SESSION_ID = '7b6d3e5a-1c2f-4a8b-9d0e-5f6a7b8c9d0e'

describe('copilot payload round-trips', () => {
  it('survives every legacy confirmation the copilot could offer', () => {
    const cases: Array<[string, unknown]> = [
      [encodeCopilotPayload('cancel'), { action: 'cancel' }],
      [
        encodeCopilotPayload('confirm', 'send_debt_reminder_all'),
        { action: 'confirm', kind: 'send_debt_reminder_all' },
      ],
      [
        encodeCopilotPayload('confirm', 'send_debt_reminder_parent', PARENT_ID),
        { action: 'confirm', kind: 'send_debt_reminder_parent', parentId: PARENT_ID },
      ],
    ]

    for (const [encoded, payload] of cases) {
      expect(decodeCopilotPayload(encoded), encoded).toEqual(payload)
    }
  })

  it('survives every session payload', () => {
    const cases: Array<[string, unknown]> = [
      [
        encodeCopilotSessionPayload('confirm', SESSION_ID),
        { action: 'confirm_session', sessionId: SESSION_ID },
      ],
      [
        encodeCopilotSessionPayload('cancel', SESSION_ID),
        { action: 'cancel_session', sessionId: SESSION_ID },
      ],
      [
        encodeCopilotSessionPayload('pick', SESSION_ID, 3),
        { action: 'pick', sessionId: SESSION_ID, index: 3 },
      ],
    ]

    for (const [encoded, payload] of cases) {
      expect(decodeCopilotPayload(encoded), encoded).toEqual(payload)
    }
  })

  it('stays well inside Meta’s reply-id length limit', () => {
    const longest = encodeCopilotPayload('confirm', 'send_debt_reminder_parent', PARENT_ID)
    expect(longest.length).toBeLessThan(80)
    expect(encodeCopilotSessionPayload('pick', SESSION_ID, 9).length).toBeLessThan(80)
  })
})

describe('session payload validation', () => {
  it('rejects a session slot that is not a uuid', () => {
    // The id is client-supplied. A forged or mangled one must decode to
    // nothing, not reach the session lookup.
    expect(decodeCopilotPayload('cp:c:not-a-uuid')).toBeNull()
    expect(decodeCopilotPayload('cp:x:')).toBeNull()
    expect(decodeCopilotPayload(`cp:p:not-a-uuid:0`)).toBeNull()
  })

  it('rejects the wrong arity for each session form', () => {
    expect(decodeCopilotPayload(`cp:c:${SESSION_ID}:extra`)).toBeNull()
    expect(decodeCopilotPayload(`cp:x:${SESSION_ID}:extra`)).toBeNull()
    expect(decodeCopilotPayload(`cp:p:${SESSION_ID}`)).toBeNull()
    expect(decodeCopilotPayload(`cp:p:${SESSION_ID}:0:extra`)).toBeNull()
  })

  it('rejects a pick index that is not a plain non-negative integer', () => {
    expect(decodeCopilotPayload(`cp:p:${SESSION_ID}:-1`)).toBeNull()
    expect(decodeCopilotPayload(`cp:p:${SESSION_ID}:1.5`)).toBeNull()
    expect(decodeCopilotPayload(`cp:p:${SESSION_ID}:01`)).toBeNull()
    expect(decodeCopilotPayload(`cp:p:${SESSION_ID}:abc`)).toBeNull()
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
