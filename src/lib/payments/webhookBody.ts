/**
 * Normalises a provider webhook body into flat string values for the registry
 * parsers. Shared by the payment webhook and the invoice webhook so both accept
 * exactly the same shapes — Grow, for one, posts form-encoded rather than JSON.
 */

/**
 * Flattens JSON webhook payloads: top-level primitives plus one nested object
 * (e.g. `{ "data": { "transactionId": "..." } }`) into string values for parsers.
 * Anything that is not JSON is parsed as form-encoded.
 */
export function webhookBodyFromPayload(
  rawBody: string,
  contentType: string
): Record<string, string> {
  const ct = contentType.toLowerCase()
  if (ct.includes('application/json')) {
    const parsed = JSON.parse(rawBody) as Record<string, unknown>
    const flat: Record<string, string> = {}
    for (const [k, v] of Object.entries(parsed)) {
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
        for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) {
          flat[k2] = v2 === undefined || v2 === null ? '' : String(v2)
        }
      } else {
        flat[k] = v === undefined || v === null ? '' : String(v)
      }
    }
    return flat
  }
  return Object.fromEntries(new URLSearchParams(rawBody))
}
