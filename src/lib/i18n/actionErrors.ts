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
