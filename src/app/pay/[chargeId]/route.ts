/**
 * The pay button's destination: /pay/<chargeId> → the provider's checkout.
 *
 * This indirection exists for one reason. A Meta template URL button takes a
 * fixed base plus a dynamic *suffix* — it cannot carry a whole arbitrary URL —
 * and a charge's payment_link points at whichever provider the org uses, on a
 * domain that varies per org and per charge. Sending the charge id instead and
 * resolving it here is what makes an approved-template pay button possible at
 * all.
 *
 * Deliberately unauthenticated (see the bypass in src/proxy.ts): whoever holds
 * the link is the parent it was sent to, and all this route does is forward to
 * a checkout page that authenticates on its own. A charge id is a uuid, so it
 * cannot be walked.
 */

import { NextResponse } from 'next/server'

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getShareableBaseUrl } from '@/lib/url/appUrl'

const UUID = /^[0-9a-f-]{36}$/i

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ chargeId: string }> }
) {
  const { chargeId } = await params

  if (!UUID.test(chargeId)) return new NextResponse('Not found', { status: 404 })

  const db = createServiceRoleClient()
  const { data: charge } = await db
    .from('charges')
    .select('organization_id, payment_link')
    .eq('id', chargeId)
    .maybeSingle()

  if (!charge) return new NextResponse('Not found', { status: 404 })

  // A charge whose provider link was never minted (or has since been cleared)
  // still has somewhere real to send the parent: their own portal, where the
  // balance is payable. Better than a dead end on a message we sent them.
  //
  // The same fallback covers a link that is not a plain https: URL. This route
  // is unauthenticated and redirects wherever the column points, so it would
  // otherwise forward to `javascript:` or `data:` if a provider integration —
  // or anything with write access to charges — ever put one there. https: only,
  // matching the check the invoice webhook already applies to provider URLs.
  const link = charge.payment_link as string | null
  const destination =
    (link && isHttpsUrl(link) ? link : null) ??
    `${getShareableBaseUrl()}/portal/${charge.organization_id}`

  return NextResponse.redirect(destination, 302)
}
