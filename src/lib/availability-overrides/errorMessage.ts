/**
 * Turns an `OverrideMutationError` into the sentence the form shows.
 * Kept out of both `actions.ts` files so the two routes cannot drift, and out
 * of `./index` so it stays a plain module either side can import — `./index`
 * pulls in the Supabase server client, and with it `next/headers`.
 */

import { getTranslations } from 'next-intl/server'
import type { OverrideMutationError } from './index'

export async function overrideErrorMessage(
  failure: OverrideMutationError
): Promise<string> {
  const t = await getTranslations()
  return t(`teacherSelf.errors.${failure.key}`)
}
