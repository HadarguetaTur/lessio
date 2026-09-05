import { vi } from 'vitest'
import heMessages from './messages/he.json'

/**
 * Test-only encryption keys.
 *
 * Code paths that store a credential (the Sumit card token, per-org provider
 * config) encrypt through src/lib/crypto, which demands a 64-character hex key
 * and throws without one. `validateEnv()` is skipped under NODE_ENV=test, so
 * nothing else would supply these, and a suite exercising such a path would
 * fail on the missing key rather than on its own subject.
 *
 * These are deliberately worthless constants — never a real key — and are only
 * set when the environment has not already provided one.
 */
const TEST_ENCRYPTION_KEY = '0'.repeat(64)
for (const key of [
  'PAYMENT_CONFIG_ENCRYPTION_KEY',
  'WHATSAPP_TOKEN_ENCRYPTION_KEY',
  'GMAIL_TOKEN_ENCRYPTION_KEY',
  'GOOGLE_CALENDAR_ENCRYPTION_KEY',
  'AI_CONFIG_ENCRYPTION_KEY',
]) {
  process.env[key] ??= TEST_ENCRYPTION_KEY
}

/**
 * `next-intl/server` resolves its locale from the request, which does not exist
 * under Vitest — importing it in a non-request context throws
 * "`getTranslations` is not supported in Client Components."
 *
 * Server Actions read their user-facing strings through it, so without this
 * mock every action test would fail on the translation call rather than on the
 * behaviour it is testing. Resolving against `he.json` keeps assertions written
 * against the Hebrew copy (the product's default locale) working unchanged.
 */
function resolve(namespace: string | undefined, key: string): string {
  const path = namespace ? `${namespace}.${key}` : key
  let node: unknown = heMessages
  for (const part of path.split('.')) {
    if (node === null || typeof node !== 'object') return path
    node = (node as Record<string, unknown>)[part]
  }
  return typeof node === 'string' ? node : path
}

function interpolate(message: string, values?: Record<string, unknown>): string {
  if (!values) return message
  return message.replace(/\{(\w+)\}/g, (whole, name) =>
    name in values ? String(values[name]) : whole
  )
}

/**
 * Same reasoning as above, for the cache API: `revalidatePath` outside a
 * request scope throws "static generation store missing", so any test of a
 * Server Action that revalidates would fail on the harness rather than on the
 * behaviour. A per-file `vi.mock('next/cache', …)` still overrides this, which
 * is what the tests that assert on revalidation calls rely on.
 */
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}))

vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace?: string) => {
    const t = (key: string, values?: Record<string, unknown>) =>
      interpolate(resolve(namespace, key), values)
    t.rich = t
    t.raw = (key: string) => resolve(namespace, key)
    return t
  },
  getLocale: async () => 'he',
  getMessages: async () => heMessages,
  getNow: async () => new Date(),
  getTimeZone: async () => 'Asia/Jerusalem',
}))
