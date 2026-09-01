/**
 * Turns a `BreakMutationError` into the sentence the form shows.
 * Kept out of both `actions.ts` files so the teacher route and the admin route
 * cannot drift, mirroring `@/lib/availability/errorMessage`.
 */

import { getTranslations } from 'next-intl/server'
import type { BreakMutationError } from './breaks'
import type { TailResolveError } from './tailPrompts'

export async function breakErrorMessage(failure: BreakMutationError): Promise<string> {
  const t = await getTranslations()
  return t(`teacherSelf.errors.${failure.key}`)
}

export async function tailErrorMessage(failure: TailResolveError): Promise<string> {
  const t = await getTranslations()
  return t(`teacherSelf.tail.errors.${failure.key}`)
}
