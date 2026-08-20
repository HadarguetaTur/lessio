/**
 * Server-only base-URL resolution derived from the incoming request.
 *
 * Kept apart from ./appUrl.ts because this imports `next/headers`, which
 * cannot be pulled into a client component.
 */

import { headers } from 'next/headers'
import { PRODUCTION_APP_URL } from './appUrl'

/**
 * Origin of the request being served — `https://www.getlessio.com` in
 * production, `http://localhost:3000` under `npm run dev`.
 *
 * Use this for links that return the *current* visitor to the app: Supabase
 * auth callbacks in password-reset and signup-confirmation emails. A dev
 * signup has to land back on the dev server, so localhost is correct here.
 *
 * For anything a third party will open, use `getShareableBaseUrl()` instead.
 */
export async function getRequestBaseUrl(): Promise<string> {
  const headersList = await headers()
  const host = headersList.get('host')
  if (!host) return PRODUCTION_APP_URL

  const forwardedProto = headersList.get('x-forwarded-proto')
  const proto = forwardedProto ?? (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? 'http' : 'https')

  return `${proto}://${host}`
}
