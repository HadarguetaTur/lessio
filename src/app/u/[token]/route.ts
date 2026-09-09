/**
 * One-click unsubscribe from the outbound cold-email engine.
 *
 * GET renders a confirmation page and changes nothing. This is not politeness:
 * link scanners (Outlook SafeLinks, corporate mail gateways, Gmail's own
 * prefetch) follow every URL in an email, and a GET that erased would delete
 * prospects nobody ever clicked.
 *
 * POST performs it — both from the page's button and from the mail client's
 * own Unsubscribe button, which sends `List-Unsubscribe=One-Click` per
 * RFC 8058. Always answers 200 with the same page, whether the token was
 * valid, already used or never existed: the address is gone either way, and a
 * different answer per token would let a stranger probe the list.
 */

import { NextRequest, NextResponse } from 'next/server'

import { unsubscribeByToken } from '@/lib/outbound/unsubscribe'
import { describeThrown, reportError } from '@/lib/telemetry/reportError'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function page(body: { title: string; line: string; button?: string }): string {
  const button = body.button
    ? `<form method="post"><button type="submit" style="margin-top:24px;background:#111827;color:#fff;border:0;border-radius:8px;padding:14px 28px;font-size:16px;font-weight:700;cursor:pointer;font-family:inherit;">${body.button}</button></form>`
    : ''
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Lessio</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <main style="background:#fff;border-radius:14px;padding:40px 32px;max-width:420px;width:calc(100% - 32px);text-align:center;">
    <div style="font-size:20px;font-weight:800;color:#111827;">Lessio</div>
    <h1 style="margin:20px 0 8px;font-size:20px;color:#111827;">${body.title}</h1>
    <p style="margin:0;color:#4b5563;font-size:15px;line-height:1.6;">${body.line}</p>
    ${button}
  </main>
</body>
</html>`
}

const HTML = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }

export async function GET() {
  return new NextResponse(
    page({
      title: 'להסיר אותך מהרשימה?',
      line: 'לחיצה אחת ולא נכתוב שוב. הפרטים שלך יימחקו אצלנו לגמרי.',
      button: 'כן, להסיר אותי',
    }),
    { status: 200, headers: HTML }
  )
}

export async function POST(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params
  const raw = await request.text().catch(() => '')
  const source = raw.includes('List-Unsubscribe=One-Click') ? 'one_click' : 'link'

  try {
    await unsubscribeByToken(token, source)
  } catch (thrown) {
    // The person asked to be removed; answering with an error page would be
    // the wrong end of the trade. Report it and let the cron's suppression
    // check catch the rest.
    const described = describeThrown(thrown)
    console.error('[outbound/u] unsubscribe failed', described.message)
    await reportError({ ...described, route: '/u/[token]', source: 'server' })
  }

  return new NextResponse(
    page({
      title: 'הוסרת מהרשימה',
      line: 'לא נכתוב שוב, והפרטים שלך נמחקו אצלנו. סליחה על ההפרעה.',
    }),
    { status: 200, headers: HTML }
  )
}
