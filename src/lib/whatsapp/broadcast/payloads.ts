/**
 * The quick-reply payload carried by every broadcast's opt-out button.
 *
 * Same grammar as the attendance and homework payloads (entityPayloads.ts):
 * three colon-separated parts ending in a UUID, so a decoder that does not
 * recognise the prefix returns null and the message falls through to normal
 * routing. Reply ids are client-supplied, so the campaign is re-checked against
 * the receiving org before anything is written.
 */

const BROADCAST_PREFIX = 'bc'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface BroadcastStopPayload {
  kind: 'broadcast_stop'
  campaignId: string
}

export function encodeBroadcastStopPayload(campaignId: string): string {
  return `${BROADCAST_PREFIX}:stop:${campaignId}`
}

export function decodeBroadcastPayload(replyId: string | undefined): BroadcastStopPayload | null {
  if (!replyId) return null
  const parts = replyId.split(':')
  if (parts.length !== 3) return null

  const [prefix, action, id] = parts
  if (prefix !== BROADCAST_PREFIX || action !== 'stop') return null
  if (!UUID.test(id)) return null

  return { kind: 'broadcast_stop', campaignId: id }
}
