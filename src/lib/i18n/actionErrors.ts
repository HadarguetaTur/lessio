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
