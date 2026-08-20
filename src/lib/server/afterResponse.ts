import { after } from 'next/server'

/**
 * Keeps background work alive past the response.
 *
 * A plain fire-and-forget promise in a Server Action or Route Handler dies
 * when Vercel freezes the lambda right after the response is sent. That was
 * survivable while the work was a single fast call; it stopped being
 * survivable once every business-initiated WhatsApp send first passes the
 * consent gate (src/lib/whatsapp/consent.ts) — a few extra round trips were
 * enough to push the real send past the freeze, and the homework message
 * simply never left.
 *
 * `after()` registers the promise with Next so the runtime waits for it.
 * Outside a request scope (vitest) it throws, in which case the work is
 * awaited inline — same pattern the booking confirmation already used.
 */
export async function runAfterResponse(work: Promise<unknown>): Promise<void> {
  try {
    after(work)
  } catch {
    await work
  }
}
