import { getTranslations } from 'next-intl/server'

/**
 * The handful of error strings almost every Server Action returns.
 *
 * Server Actions hand their `{ error }` string straight to a client toast, so
 * the string has to already be in the user's language — there is no cross-locale
 * fallback to save an untranslated one (see `src/i18n/request.ts`).
 *
 * This exists instead of `const t = await getTranslations()` in every action
 * because it needs no binding in scope: it drops into any async function,
 * including the deeply-nested guard clauses these checks tend to live in.
 * Reach for `getTranslations()` directly when an action needs several strings
 * from its own namespace.
 */
export type CommonErrorKey =
  | 'unexpected'
  | 'required'
  | 'noPermission'
  | 'ownerOnly'
  | 'supportModeReadOnly'
  | 'saasReadOnly'
  | 'invalidData'
  | 'notFound'
  | 'saveFailed'
  | 'loadFailed'
  | 'deleteFailed'
  | 'whatsappNotConnected'

export async function commonError(key: CommonErrorKey): Promise<string> {
  const t = await getTranslations('common.errors')
  return t(key)
}

/**
 * Turns a thrown `requireMutation` into a sentence.
 *
 * `requireMutation` throws a bare Error with a stable code because it is
 * synchronous and cannot await a translator. Actions that let that throw escape
 * hand the customer a generic server-action failure that reads as a crash —
 * which is what every button on the WhatsApp settings page did for a superadmin
 * in support mode and for an owner whose subscription had lapsed (UX audit F3).
 *
 * The two codes are different situations and get different sentences: one is a
 * deliberate read-only view, the other is a billing problem the owner can fix.
 * Anything else is rethrown, because it is not ours to swallow.
 *
 * Usage:
 *   try { requireMutation(session) }
 *   catch (err) { return { error: await mutationBlockedError(err) } }
 */
export async function mutationBlockedError(err: unknown): Promise<string> {
  const code = err instanceof Error ? err.message : ''
  if (code === 'SUPPORT_MODE_READ_ONLY') return commonError('supportModeReadOnly')
  if (code === 'SAAS_READ_ONLY') return commonError('saasReadOnly')
  throw err
}

/** Looks like `students.errors.fullNameRequired` rather than display copy. */
const CATALOG_KEY = /^[a-z][\w]*(\.[\w]+)+$/

/**
 * Surfaces the first Zod issue from a `safeParse` failure.
 *
 * Schemas are usually declared at module scope, where no translator exists, so
 * their messages are written as catalog keys instead of display copy. This
 * resolves such a key, and falls back to the generic message for Zod's own
 * built-in messages ("Invalid uuid") or a missing key — neither is worth
 * showing a user verbatim.
 */
export async function zodError(issue?: { message: string }): Promise<string> {
  if (!issue || !CATALOG_KEY.test(issue.message)) return commonError('invalidData')
  const t = await getTranslations()
  try {
    return t(issue.message)
  } catch {
    return commonError('invalidData')
  }
}
