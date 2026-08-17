import { vi } from 'vitest'
import heMessages from './messages/he.json'

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
