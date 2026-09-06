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
    function visit(value: unknown, path: string): void {
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
          visit(child, path ? `${path}.${key}` : key)
        }
        return
      }
      flat[path] = value === undefined || value === null ? '' : String(value)
    }
    visit(parsed, '')
    return flat
  }
  return Object.fromEntries(new URLSearchParams(rawBody))
}
