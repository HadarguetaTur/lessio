/**
 * Error grouping for Edge Functions — the Deno mirror of
 * src/lib/telemetry/fingerprint.ts.
 *
 * SYNC: this must produce the same hash as the Node side for the same failure.
 * A drifting normalizer does not fail loudly — it silently splits one bug into
 * two groups, so neither reaches the threshold that opens a dev_issue and the
 * whole detection pipeline goes quiet. src/lib/telemetry/denoParity.test.ts
 * compares the two implementations on real inputs; keep it passing.
 *
 * Deliberately import-free so Vitest can load it directly (the same reason
 * _shared/templates.ts has no imports).
 */

/**
 * Order matters: uuids before the generic number rule, so a uuid is not first
 * mangled into `<id>-<num>-…` by its numeric groups.
 */
const NORMALIZERS: Array<[RegExp, string]> = [
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<uuid>'],
  [/\+\d{9,15}\b/g, '<phone>'],
  [/\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?Z?)?/g, '<date>'],
  [/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, '<email>'],
  [/\bhttps?:\/\/\S+/gi, '<url>'],
  [/\b[0-9a-f]{16,}\b/gi, '<hex>'],
  [/'[^']*'/g, "'<v>'"],
  [/"[^"]*"/g, '"<v>"'],
  [/\b\d+\b/g, '<num>'],
]

export function normalizeMessage(message: string): string {
  let out = message
  for (const [pattern, replacement] of NORMALIZERS) {
    out = out.replace(pattern, replacement)
  }
  return out.replace(/\s+/g, ' ').trim().slice(0, 500)
}

export function normalizeRoute(route: string): string {
  if (!route) return ''
  const path = route.split('?')[0]!
  return path
    .split('/')
    .map((segment) => {
      if (!segment) return segment
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)) {
        return '<id>'
      }
      if (/^\d+$/.test(segment)) return '<id>'
      return segment
    })
    .join('/')
}

/** Node hashes with node:crypto; SubtleCrypto is the Deno equivalent. */
async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * The separator the Node side joins on is a literal NUL byte, which its source
 * carries as an unprintable character — invisible in an editor and in a diff.
 * Written here as an escape so the mirror can be read rather than guessed. A
 * separator that cannot appear inside a part is what stops ("a b", "") and
 * ("a", "b") from hashing to the same group.
 */
const PART_SEPARATOR = '\0'

/**
 * 16 hex chars of sha256 over name + normalized message + route.
 *
 * `digest` is not part of the hash on either side — see the Node file for why.
 */
export async function fingerprintError(input: {
  name?: string | null
  message?: string | null
  route?: string | null
}): Promise<string> {
  const parts = [
    (input.name ?? 'Error').trim(),
    normalizeMessage(input.message ?? ''),
    normalizeRoute(input.route ?? ''),
  ]
  return (await sha256Hex(parts.join(PART_SEPARATOR))).slice(0, 16)
}
