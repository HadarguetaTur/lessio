/**
 * The request's attribution cookies, in the shape the signup paths freeze onto
 * a new organization.
 *
 * Server-only (next/headers). Both signup paths — email and Google — go through
 * this, so neither can quietly stop recording where a customer came from; the
 * Google path did exactly that until it shared this helper.
 */

import { cookies } from 'next/headers'

import {
  FIRST_TOUCH_COOKIE,
  LAST_TOUCH_COOKIE,
  VISITOR_COOKIE,
  buildOrgAttribution,
  decodeTouch,
  type AttributionTouch,
} from './index'

export type RequestAttribution = {
  attribution: Record<string, unknown> | null
  visitorId: string | null
  lastTouch: AttributionTouch | null
}

export async function readRequestAttribution(): Promise<RequestAttribution> {
  const jar = await cookies()
  const visitorId = jar.get(VISITOR_COOKIE)?.value ?? null
  const firstTouch = decodeTouch(jar.get(FIRST_TOUCH_COOKIE)?.value)
  const lastTouch = decodeTouch(jar.get(LAST_TOUCH_COOKIE)?.value)

  return {
    attribution: buildOrgAttribution({ firstTouch, lastTouch, visitorId }),
    visitorId,
    lastTouch: lastTouch ?? firstTouch,
  }
}
