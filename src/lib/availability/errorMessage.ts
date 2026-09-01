/**
 * Turns an `AvailabilityMutationError` into the sentence the form shows.
 * Kept out of both `actions.ts` files so the two routes cannot drift, and out
 * of `./index` so it stays a plain module either side can import.
 */

import { getTranslations } from 'next-intl/server'
import { DAY_KEYS } from './constants'
import type { AvailabilityMutationError } from './index'

export async function availabilityErrorMessage(
  failure: AvailabilityMutationError
): Promise<string> {
  const t = await getTranslations()

  if (failure.key === 'overlappingDays') {
    const names = failure.days.map((d) => t(`common.days.${DAY_KEYS[d]}`))
    return t('teacherSelf.errors.overlappingDays', { days: names.join(', ') })
  }

  return t(`teacherSelf.errors.${failure.key}`)
}
