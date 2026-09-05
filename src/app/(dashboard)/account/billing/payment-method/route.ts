/**
 * GET /account/billing/payment-method — send the owner to Sumit's own customer
 * page, where they can replace the card on file.
 *
 * Why a redirect route rather than a link rendered on the billing page: the
 * URL has to be fetched from Sumit, and doing that during the page render
 * would put a network call in front of every visit to /account/billing —
 * including the visits by owners with no card at all.
 *
 * Nothing needs to happen here afterwards. Renewals charge by Sumit customer
 * rather than by a stored token (src/lib/saas/renewal.ts), so a card replaced
 * on that page is the card the next renewal uses.
 */

import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getSumitCustomerIdForOrg } from '@/lib/saas/subscriptions'
import { getSumitCustomerHistoryUrl } from '@/lib/saas/sumit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const session = await getSession()
  const back = new URL('/account/billing', request.url)

  // Billing is the owner's business, and support mode is read-only — neither
  // an admin nor an impersonating superadmin may change the card on file.
  if (session.role !== 'owner' || session.isSupportMode) {
    return NextResponse.redirect(back)
  }

  const customerId = await getSumitCustomerIdForOrg(session.orgId)
  const url = customerId ? await getSumitCustomerHistoryUrl(customerId) : null

  if (!url) {
    back.searchParams.set('cardUpdate', 'unavailable')
    return NextResponse.redirect(back)
  }

  return NextResponse.redirect(url)
}
