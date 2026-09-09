/**
 * Reply ids arrive from a handset, so the decoder is a trust boundary: anything
 * it accepts becomes a database write against the org that received the tap.
 */

import { describe, it, expect } from 'vitest'
import { decodeBroadcastPayload, encodeBroadcastStopPayload } from './payloads'

const CAMPAIGN = '3f2b8a1c-9d4e-4f6a-8b2c-1e5d7a9c3b0f'

describe('broadcast stop payload', () => {
  it('round-trips a campaign id', () => {
    const encoded = encodeBroadcastStopPayload(CAMPAIGN)
    expect(encoded).toBe(`bc:stop:${CAMPAIGN}`)
    expect(decodeBroadcastPayload(encoded)).toEqual({ kind: 'broadcast_stop', campaignId: CAMPAIGN })
  })

  it('falls through for other payload families', () => {
    // These belong to the attendance and menu handlers; returning null is what
    // lets the webhook keep routing them.
    expect(decodeBroadcastPayload(`att:ok:${CAMPAIGN}`)).toBeNull()
    expect(decodeBroadcastPayload(`hw:done:${CAMPAIGN}`)).toBeNull()
    expect(decodeBroadcastPayload('m:book')).toBeNull()
  })

  it('rejects anything that is not a real id', () => {
    expect(decodeBroadcastPayload(undefined)).toBeNull()
    expect(decodeBroadcastPayload('')).toBeNull()
    expect(decodeBroadcastPayload('bc:stop:not-a-uuid')).toBeNull()
    expect(decodeBroadcastPayload('bc:stop:')).toBeNull()
    expect(decodeBroadcastPayload(`bc:stop:${CAMPAIGN}:extra`)).toBeNull()
    expect(decodeBroadcastPayload(`bc:${CAMPAIGN}`)).toBeNull()
  })

  it('accepts only the stop action', () => {
    expect(decodeBroadcastPayload(`bc:start:${CAMPAIGN}`)).toBeNull()
  })
})
