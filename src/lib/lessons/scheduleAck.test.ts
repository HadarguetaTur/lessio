/**
 * The staff override acknowledgement used to be three raw FormData booleans:
 *
 *     formData.get('confirm_calendar_conflict') === '1'
 *
 * No nonce, no server-side proposal, no echo of the warning that was shown.
 * A caller could assert all three on the FIRST request, which meant the
 * calendar was never read at all — a genuine `busy` diary and an
 * `unknown_provider_error` were equally undiscovered. These tests pin that the
 * replacement cannot be minted, replayed onto another slot, or outlived.
 */

import { describe, expect, it, beforeAll } from 'vitest'
import { issueScheduleAck, verifyScheduleAck, type ScheduleAckSlot } from './scheduleAck'

const SLOT: ScheduleAckSlot = {
  orgId: 'org-1',
  teacherId: 'teacher-1',
  date: '2026-09-24',
  startTime: '17:00',
  durationMinutes: 60,
}

beforeAll(() => {
  process.env.SUPPORT_SESSION_SECRET =
    'test-secret-at-least-thirty-two-characters-long'
})

describe('scheduleAck', () => {
  it('waives exactly the guards it was issued for', () => {
    const token = issueScheduleAck(SLOT, ['calendar'])
    const waived = verifyScheduleAck(token, SLOT)

    expect(waived.has('calendar')).toBe(true)
    // The old booleans were independent, so answering one dialog said nothing
    // about the others. A token must be just as narrow.
    expect(waived.has('availability')).toBe(false)
    expect(waived.has('schedule_impact')).toBe(false)
  })

  it('acknowledges nothing for a token the client made up', () => {
    // The whole class of attack: asserting the acknowledgement rather than
    // being given one.
    expect(verifyScheduleAck('1', SLOT).size).toBe(0)
    expect(verifyScheduleAck('yes.please', SLOT).size).toBe(0)
    expect(
      verifyScheduleAck(
        Buffer.from(JSON.stringify({ ...SLOT, kinds: ['calendar'], exp: Date.now() + 1e6 }))
          .toString('base64url') + '.forged',
        SLOT
      ).size
    ).toBe(0)
  })

  it('acknowledges nothing when the payload is edited under a valid signature', () => {
    const token = issueScheduleAck(SLOT, ['calendar'])
    const [body, sig] = token.split('.')
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    payload.kinds = ['availability', 'calendar', 'schedule_impact']
    const tampered =
      Buffer.from(JSON.stringify(payload)).toString('base64url') + '.' + sig

    expect(verifyScheduleAck(tampered, SLOT).size).toBe(0)
  })

  it('cannot be replayed onto a different slot', () => {
    const token = issueScheduleAck(SLOT, ['availability', 'calendar'])

    // Every component of the slot is load-bearing: a warning about Thursday
    // 17:00 must not wave through Thursday 18:00, another teacher, or another
    // tenant entirely.
    expect(verifyScheduleAck(token, { ...SLOT, startTime: '18:00' }).size).toBe(0)
    expect(verifyScheduleAck(token, { ...SLOT, date: '2026-09-25' }).size).toBe(0)
    expect(verifyScheduleAck(token, { ...SLOT, teacherId: 'teacher-2' }).size).toBe(0)
    expect(verifyScheduleAck(token, { ...SLOT, orgId: 'org-2' }).size).toBe(0)
    expect(verifyScheduleAck(token, { ...SLOT, durationMinutes: 90 }).size).toBe(0)

    // ...and still works for the slot it was actually about.
    expect(verifyScheduleAck(token, SLOT).size).toBe(2)
  })

  it('expires', () => {
    const issuedAt = 1_000_000_000_000
    const token = issueScheduleAck(SLOT, ['calendar'], issuedAt)

    expect(verifyScheduleAck(token, SLOT, issuedAt + 60_000).size).toBe(1)
    expect(verifyScheduleAck(token, SLOT, issuedAt + 11 * 60_000).size).toBe(0)
  })

  it('acknowledges nothing for a missing token', () => {
    expect(verifyScheduleAck(null, SLOT).size).toBe(0)
    expect(verifyScheduleAck(undefined, SLOT).size).toBe(0)
    expect(verifyScheduleAck('', SLOT).size).toBe(0)
  })

  it('verifies regardless of the order the guards fired in', () => {
    const a = issueScheduleAck(SLOT, ['calendar', 'availability'])
    const b = issueScheduleAck(SLOT, ['availability', 'calendar'])
    expect(a).toBe(b)
    expect(verifyScheduleAck(a, SLOT).size).toBe(2)
  })
})
